#!/usr/bin/env python3
import sqlite3
import os
import sys
import argparse
from pathlib import Path

def convert_to_portable_scf(file_path, no_rename=False):
    path = Path(file_path)
    if not path.exists():
        print(f"Error: File not found: {file_path}")
        return False

    print(f"\n--- Processing: {path.name} ---")
    
    try:
        # Connect to the database
        conn = sqlite3.connect(str(path))
        
        # Check current mode
        current_mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        print(f"  [1/3] Current mode is {current_mode.upper()}")
        
        # 1. Force to DELETE mode
        print("  [2/3] Switching to DELETE journal mode...")
        conn.execute("PRAGMA journal_mode=delete")
        
        # 2. VACUUM is critical
        print("  [3/3] Vacuuming database (consolidating data into single file)...")
        conn.execute("VACUUM")
        
        conn.close()
        
        # 3. Rename to .scf if necessary
        final_path = path
        if not no_rename and path.suffix.lower() != '.scf':
            new_path = path.with_suffix('.scf')
            if new_path.exists():
                print(f"  Note: {new_path.name} already exists. Skipping rename.")
            else:
                os.rename(path, new_path)
                final_path = new_path
                print(f"  Renamed: {path.name} -> {new_path.name}")
        
        print(f"SUCCESS: {final_path.name} is now ready for the serverless editor.")
        return True

    except sqlite3.Error as e:
        print(f"  ERROR: SQLite error: {e}")
        print("  If you see 'CANTOPEN', ensure you are not missing the -wal or -shm sidecar files.")
        return False
    except Exception as e:
        print(f"  ERROR: Unexpected error: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(
        description="SCF Migration Utility: Converts WAL databases to portable DELETE mode .scf files."
    )
    parser.add_argument(
        "path", 
        help="Path to a .db/.scf file or a directory containing them."
    )
    parser.add_argument(
        "--no-rename", 
        action="store_true", 
        help="Do not rename files to .scf extension."
    )
    
    args = parser.parse_args()
    target_path = Path(args.path)

    if target_path.is_dir():
        # Find all .db and .scf files
        files = list(target_path.glob("*.db")) + list(target_path.glob("*.scf"))
        if not files:
            print(f"No database files found in {args.path}")
        else:
            print(f"Found {len(files)} files to convert...")
            for f in files:
                convert_to_portable_scf(f, no_rename=args.no_rename)
    else:
        convert_to_portable_scf(target_path, no_rename=args.no_rename)

if __name__ == "__main__":
    main()

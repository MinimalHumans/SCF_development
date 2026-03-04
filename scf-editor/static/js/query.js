/* ==========================================================================
   SCF Editor — Query Explorer JavaScript
   ========================================================================== */

// -- Helpers ------------------------------------------------------------------

async function fetchQuery(url) {
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`Query failed: ${resp.status}`);
    }
    return resp.json();
}

function showResults(title, html) {
    const container = document.getElementById('query-results');
    document.getElementById('query-results-title').textContent = title;
    document.getElementById('query-results-body').innerHTML = html;
    container.classList.remove('hidden');
    container.scrollIntoView({ behavior: 'smooth' });
}

function showError(msg) {
    showResults('Error', `<div class="query-error">${msg}</div>`);
}

function esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function badge(text, variant) {
    if (!text) return '';
    const cls = variant ? `query-badge query-badge-${variant}` : 'query-badge';
    return `<span class="${cls}">${esc(text)}</span>`;
}

// -- Query Runners ------------------------------------------------------------

async function runCharacterJourney() {
    const id = document.getElementById('qc-character-journey').value;
    if (!id) return showError('Please select a character.');

    const charName = document.getElementById('qc-character-journey')
        .selectedOptions[0].textContent;

    const data = await fetchQuery(`/api/query/character-journey?character_id=${id}`);

    if (data.length === 0) {
        return showResults(`Character Journey: ${charName}`,
            '<div class="query-empty">No scene links found for this character. ' +
            'Add Scene-Character connections first.</div>');
    }

    let html = '<table class="query-table"><thead><tr>' +
        '<th>#</th><th>Scene</th><th>Location</th><th>Time</th>' +
        '<th>Role</th><th>Emotional Beat</th><th>Other Characters</th>' +
        '</tr></thead><tbody>';

    for (const row of data) {
        const others = (row.other_characters || [])
            .map(o => `${esc(o.character_name)} ${badge(o.role_in_scene, 'muted')}`)
            .join(', ') || '<span class="text-muted">none</span>';

        html += `<tr>
            <td class="mono">${esc(row.scene_number)}</td>
            <td><a href="/browse?entity_type=scene&entity_id=${row.scene_id}">${esc(row.scene_name)}</a></td>
            <td>${esc(row.location_name) || '\u2014'}</td>
            <td>${esc(row.time_of_day) || '\u2014'}</td>
            <td>${badge(row.role_in_scene || '\u2014', 'accent')}</td>
            <td>${esc(row.emotional_beat) || '\u2014'}</td>
            <td>${others}</td>
        </tr>`;
    }

    html += '</tbody></table>';
    showResults(`Character Journey: ${charName} (${data.length} scenes)`, html);
}

async function runLocationBreakdown() {
    const id = document.getElementById('qc-location-breakdown').value;
    if (!id) return showError('Please select a location.');

    const locName = document.getElementById('qc-location-breakdown')
        .selectedOptions[0].textContent;

    const data = await fetchQuery(`/api/query/location-breakdown?location_id=${id}`);

    if (data.length === 0) {
        return showResults(`Location Breakdown: ${locName}`,
            '<div class="query-empty">No scenes use this location.</div>');
    }

    let html = '<table class="query-table"><thead><tr>' +
        '<th>#</th><th>Scene</th><th>Time</th><th>Characters</th>' +
        '<th>Props</th><th>Emotional Beat</th>' +
        '</tr></thead><tbody>';

    for (const row of data) {
        const chars = (row.characters || [])
            .map(c => `${esc(c.character_name)} ${badge(c.role_in_scene, 'muted')}`)
            .join(', ') || '\u2014';
        const props = (row.props || [])
            .map(p => `${esc(p.prop_name)} ${badge(p.significance, 'muted')}`)
            .join(', ') || '\u2014';

        html += `<tr>
            <td class="mono">${esc(row.scene_number)}</td>
            <td><a href="/browse?entity_type=scene&entity_id=${row.scene_id}">${esc(row.scene_name)}</a></td>
            <td>${esc(row.time_of_day) || '\u2014'}</td>
            <td>${chars}</td>
            <td>${props}</td>
            <td>${esc(row.emotional_beat) || '\u2014'}</td>
        </tr>`;
    }

    html += '</tbody></table>';
    showResults(`Location Breakdown: ${locName} (${data.length} scenes)`, html);
}

async function runSceneContext() {
    const id = document.getElementById('qc-scene-context').value;
    if (!id) return showError('Please select a scene.');

    const sceneName = document.getElementById('qc-scene-context')
        .selectedOptions[0].textContent;

    const d = await fetchQuery(`/api/query/scene-context?scene_id=${id}`);

    if (!d || !d.id) {
        return showResults('Scene Context', '<div class="query-empty">Scene not found.</div>');
    }

    let html = '<div class="query-context-grid">';

    // Scene info card
    html += `<div class="query-context-card">
        <h3>Scene Info</h3>
        <dl class="query-dl">
            <dt>Name</dt><dd>${esc(d.name)}</dd>
            <dt>Number</dt><dd>${esc(d.scene_number) || '\u2014'}</dd>
            <dt>Time of Day</dt><dd>${esc(d.time_of_day) || '\u2014'}</dd>
            <dt>Status</dt><dd>${esc(d.status) || '\u2014'}</dd>
            <dt>Summary</dt><dd>${esc(d.summary) || '\u2014'}</dd>
            <dt>Emotional Beat</dt><dd>${esc(d.emotional_beat) || '\u2014'}</dd>
            <dt>Visual Style</dt><dd>${esc(d.visual_style) || '\u2014'}</dd>
            <dt>Sound Design</dt><dd>${esc(d.sound_design) || '\u2014'}</dd>
        </dl>
    </div>`;

    // Location card
    if (d.location) {
        html += `<div class="query-context-card">
            <h3>Location: ${esc(d.location.name)}</h3>
            <dl class="query-dl">
                <dt>Type</dt><dd>${esc(d.location.location_type) || '\u2014'}</dd>
                <dt>Setting</dt><dd>${esc(d.location.setting) || '\u2014'}</dd>
                <dt>Mood</dt><dd>${esc(d.location.mood) || '\u2014'}</dd>
                <dt>Lighting</dt><dd>${esc(d.location.lighting) || '\u2014'}</dd>
            </dl>
        </div>`;
    }

    // Characters card
    html += `<div class="query-context-card">
        <h3>Characters (${d.characters.length})</h3>`;
    if (d.characters.length > 0) {
        html += '<table class="query-table query-table-compact"><thead><tr>' +
            '<th>Name</th><th>Role</th><th>Role in Scene</th><th>Notes</th>' +
            '</tr></thead><tbody>';
        for (const c of d.characters) {
            html += `<tr>
                <td><a href="/browse?entity_type=character&entity_id=${c.id}">${esc(c.name)}</a></td>
                <td>${esc(c.role) || '\u2014'}</td>
                <td>${badge(c.role_in_scene, 'accent')}</td>
                <td>${esc(c.link_notes) || '\u2014'}</td>
            </tr>`;
        }
        html += '</tbody></table>';
    } else {
        html += '<div class="query-empty">No characters linked</div>';
    }
    html += '</div>';

    // Props card
    html += `<div class="query-context-card">
        <h3>Props (${d.props.length})</h3>`;
    if (d.props.length > 0) {
        html += '<table class="query-table query-table-compact"><thead><tr>' +
            '<th>Name</th><th>Type</th><th>Significance</th><th>Usage Note</th>' +
            '</tr></thead><tbody>';
        for (const p of d.props) {
            html += `<tr>
                <td><a href="/browse?entity_type=prop&entity_id=${p.id}">${esc(p.name)}</a></td>
                <td>${esc(p.prop_type) || '\u2014'}</td>
                <td>${badge(p.significance, 'accent')}</td>
                <td>${esc(p.usage_note) || '\u2014'}</td>
            </tr>`;
        }
        html += '</tbody></table>';
    } else {
        html += '<div class="query-empty">No props linked</div>';
    }
    html += '</div>';

    html += '</div>';
    showResults(`Scene Context: ${sceneName}`, html);
}

async function runCharacterCrossover() {
    const id1 = document.getElementById('qc-crossover-char1').value;
    const id2 = document.getElementById('qc-crossover-char2').value;
    if (!id1 || !id2) return showError('Please select both characters.');
    if (id1 === id2) return showError('Please select two different characters.');

    const name1 = document.getElementById('qc-crossover-char1')
        .selectedOptions[0].textContent;
    const name2 = document.getElementById('qc-crossover-char2')
        .selectedOptions[0].textContent;

    const data = await fetchQuery(
        `/api/query/character-crossover?char1=${id1}&char2=${id2}`);

    if (data.length === 0) {
        return showResults(`Crossover: ${name1} & ${name2}`,
            '<div class="query-empty">These characters never appear in the same scene.</div>');
    }

    let html = '<table class="query-table"><thead><tr>' +
        `<th>#</th><th>Scene</th><th>Location</th><th>Time</th>` +
        `<th>${esc(name1)} Role</th><th>${esc(name2)} Role</th>` +
        '<th>Emotional Beat</th>' +
        '</tr></thead><tbody>';

    for (const row of data) {
        html += `<tr>
            <td class="mono">${esc(row.scene_number)}</td>
            <td><a href="/browse?entity_type=scene&entity_id=${row.scene_id}">${esc(row.scene_name)}</a></td>
            <td>${esc(row.location_name) || '\u2014'}</td>
            <td>${esc(row.time_of_day) || '\u2014'}</td>
            <td>${badge(row.char1_role, 'accent')}</td>
            <td>${badge(row.char2_role, 'accent')}</td>
            <td>${esc(row.emotional_beat) || '\u2014'}</td>
        </tr>`;
    }

    html += '</tbody></table>';
    showResults(`Crossover: ${name1} & ${name2} (${data.length} scenes)`, html);
}

async function runProjectStats() {
    const d = await fetchQuery('/api/query/project-stats');

    let html = '<div class="query-stats-grid">';

    // Counts
    html += '<div class="query-context-card"><h3>Entity Counts</h3>';
    html += '<dl class="query-dl">';
    const labels = {
        character_count: 'Characters', location_count: 'Locations',
        prop_count: 'Props', scene_count: 'Scenes',
        sequence_count: 'Sequences', theme_count: 'Themes',
        scene_character_count: 'Scene-Character Links',
        scene_prop_count: 'Scene-Prop Links',
        scene_sequence_count: 'Scene-Sequence Links',
    };
    for (const [key, label] of Object.entries(labels)) {
        html += `<dt>${label}</dt><dd class="mono">${d[key] ?? 0}</dd>`;
    }
    html += '</dl></div>';

    // Top characters
    if (d.top_characters && d.top_characters.length > 0) {
        html += '<div class="query-context-card"><h3>Most-Appearing Characters</h3>';
        html += '<table class="query-table query-table-compact"><thead><tr>' +
            '<th>Character</th><th>Scenes</th></tr></thead><tbody>';
        for (const c of d.top_characters) {
            html += `<tr>
                <td><a href="/browse?entity_type=character&entity_id=${c.id}">${esc(c.name)}</a></td>
                <td class="mono">${c.scene_count}</td>
            </tr>`;
        }
        html += '</tbody></table></div>';
    }

    // Top locations
    if (d.top_locations && d.top_locations.length > 0) {
        html += '<div class="query-context-card"><h3>Most-Used Locations</h3>';
        html += '<table class="query-table query-table-compact"><thead><tr>' +
            '<th>Location</th><th>Scenes</th></tr></thead><tbody>';
        for (const l of d.top_locations) {
            html += `<tr>
                <td><a href="/browse?entity_type=location&entity_id=${l.id}">${esc(l.name)}</a></td>
                <td class="mono">${l.scene_count}</td>
            </tr>`;
        }
        html += '</tbody></table></div>';
    }

    // Scenes without characters
    if (d.scenes_without_characters && d.scenes_without_characters.length > 0) {
        html += '<div class="query-context-card"><h3>Scenes Without Characters</h3>';
        html += '<table class="query-table query-table-compact"><thead><tr>' +
            '<th>#</th><th>Scene</th></tr></thead><tbody>';
        for (const s of d.scenes_without_characters) {
            html += `<tr>
                <td class="mono">${esc(s.scene_number)}</td>
                <td><a href="/browse?entity_type=scene&entity_id=${s.id}">${esc(s.name)}</a></td>
            </tr>`;
        }
        html += '</tbody></table></div>';
    }

    // Characters without scenes
    if (d.characters_without_scenes && d.characters_without_scenes.length > 0) {
        html += '<div class="query-context-card"><h3>Characters Without Scenes</h3>';
        html += '<table class="query-table query-table-compact"><thead><tr>' +
            '<th>Character</th><th>Role</th></tr></thead><tbody>';
        for (const c of d.characters_without_scenes) {
            html += `<tr>
                <td><a href="/browse?entity_type=character&entity_id=${c.id}">${esc(c.name)}</a></td>
                <td>${esc(c.role) || '\u2014'}</td>
            </tr>`;
        }
        html += '</tbody></table></div>';
    }

    html += '</div>';
    showResults('Project Stats', html);
}

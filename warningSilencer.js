function installWarningSilencer() {
    if (process.__viniliWarningSilencerInstalled) return;
    process.__viniliWarningSilencerInstalled = true;

    // Allow opt-in diagnostics when needed.
    if (process.env.SHOW_NODE_WARNINGS === '1') return;

    const originalEmitWarning = process.emitWarning.bind(process);
    process.emitWarning = (...args) => {
        // Drop all runtime warnings from Node/deps.
        return undefined;
    };

    process.__viniliOriginalEmitWarning = originalEmitWarning;
}

module.exports = {
    installWarningSilencer
};

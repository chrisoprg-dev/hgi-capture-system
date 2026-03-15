// ── PROPOSAL AUTO-GENERATOR ───────────────────────────────────────────────────
// Class-based auto-generator called by ProposalEngine
class ProposalAutoGen {
  constructor(props) {
    this.props = props;
  }

  async start() {
    const {
      selectedKeys, abortRef, setAutoRunning, setAutoSections,
      setActiveView, setAutoProgress, rfpText, sharedCtx,
      proposalDraft, setProposalDraft, SECTIONS,
      buildPrompt, buildSys, queryKB, getPastPerformance, callClaude, store
    } = this.props;

    abortRef.current = false;
    setAutoRunning(true);
    setActiveView('auto');

    // Initialize progress tracking for selected sections
    const progress = selectedKeys.map(key => ({ key, status: 'waiting' }));
    setAutoProgress(progress);
    setAutoSections(selectedKeys);

    const vertical = sharedCtx.vertical || 'disaster_recovery';
    let kbInjection = '';
    let pastPerformance = [];

    try {
      kbInjection = await queryKB(vertical);
      pastPerformance = await getPastPerformance('disaster_recovery');
    } catch(e) {
      console.warn('KB query failed in auto-gen:', e.message);
    }

    const activeRfp = rfpText || sharedCtx.rfpText || '';
    const currentDraft = { ...proposalDraft };

    for (let i = 0; i < selectedKeys.length; i++) {
      if (abortRef.current) break;

      const key = selectedKeys[i];
      const section = SECTIONS.find(s => s.value === key);
      if (!section) continue;

      // Mark as generating
      setAutoProgress(prev => prev.map(p => p.key === key ? { ...p, status: 'generating' } : p));

      try {
        const prompt = buildPrompt(section.label, activeRfp, kbInjection);
        const sys = buildSys(section.label, kbInjection, pastPerformance);
        const text = await callClaude(prompt, sys, 4000);

        // Save section
        currentDraft[key] = text;
        const updated = { ...currentDraft };
        setProposalDraft(updated);
        store.set('proposalDraft', updated);

        // Mark as done
        setAutoProgress(prev => prev.map(p => p.key === key ? { ...p, status: 'done' } : p));

      } catch(err) {
        console.error('Auto-gen error for section', key, err);
        setAutoProgress(prev => prev.map(p => p.key === key ? { ...p, status: 'error' } : p));
      }

      // Small delay between sections to avoid rate limiting
      if (i < selectedKeys.length - 1 && !abortRef.current) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    setAutoRunning(false);
  }
}
export const config = { maxDuration: 120 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STORAGE_BUCKET = 'knowledge-docs';
const H = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' };

// ── Inline docx builder — no npm imports needed at runtime, use dynamic import
async function buildBriefingDoc(opp) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, WidthType, ShadingType, LevelFormat } = await import('docx');

  const NAVY='1B2A5E', GOLD='B8962E', LIGHT_BLUE='EBF0FA', LIGHT_GREEN='EBF5EB',
    LIGHT_RED='FFF0F0', LIGHT_GOLD='FDF6E3', BLACK='1A1A1A', GRAY='555555', RED='CC0000', AMBER='856404';

  const b={style:BorderStyle.SINGLE,size:1,color:'CCCCCC'};
  const borders={top:b,bottom:b,left:b,right:b};
  const nb={style:BorderStyle.NONE,size:0,color:'FFFFFF'};
  const noBorders={top:nb,bottom:nb,left:nb,right:nb};

  const p=(text,opts={})=>new Paragraph({spacing:{before:opts.before??0,after:opts.after??120},alignment:opts.align??AlignmentType.LEFT,children:[new TextRun({text:text??'',font:'Arial',size:opts.size??22,bold:opts.bold??false,color:opts.color??BLACK,italics:opts.italic??false})]});
  const pRich=(runs,opts={})=>new Paragraph({spacing:{before:opts.before??0,after:opts.after??120},alignment:opts.align??AlignmentType.LEFT,children:runs.map(r=>new TextRun({text:r.text??'',font:'Arial',size:r.size??22,bold:r.bold??false,color:r.color??BLACK,italics:r.italic??false}))});
  const blank=(pts=120)=>new Paragraph({spacing:{before:0,after:pts},children:[]});
  const divider=()=>new Paragraph({spacing:{before:80,after:80},border:{bottom:{style:BorderStyle.SINGLE,size:6,color:NAVY,space:1}},children:[]});
  const thinDivider=()=>new Paragraph({spacing:{before:60,after:60},border:{bottom:{style:BorderStyle.SINGLE,size:2,color:'CCCCCC',space:1}},children:[]});
  const sectionHdr=(text)=>new Paragraph({spacing:{before:280,after:140},shading:{fill:NAVY,type:ShadingType.CLEAR},children:[new TextRun({text:'  '+text,font:'Arial',size:24,bold:true,color:'FFFFFF'})]});
  const subHdr=(text)=>new Paragraph({spacing:{before:180,after:80},children:[new TextRun({text,font:'Arial',size:22,bold:true,color:NAVY})]});
  const bullet=(text,opts={})=>new Paragraph({spacing:{before:0,after:opts.after??80},numbering:{reference:'bullets',level:0},children:[new TextRun({text:text??'',font:'Arial',size:opts.size??22,bold:opts.bold??false,color:opts.color??BLACK})]});
  const cell=(text,opts={})=>new TableCell({borders,width:opts.width?{size:opts.width,type:WidthType.DXA}:undefined,shading:{fill:opts.fill||'FFFFFF',type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:100,right:100},children:[new Paragraph({alignment:opts.align??AlignmentType.LEFT,children:[new TextRun({text:text??'',font:'Arial',size:opts.size??18,bold:opts.bold??false,color:opts.color??BLACK,italics:opts.italic??false})]})]});
  const hCell=(text,w)=>new TableCell({borders,width:{size:w,type:WidthType.DXA},shading:{fill:NAVY,type:ShadingType.CLEAR},margins:{top:80,bottom:80,left:100,right:100},children:[new Paragraph({children:[new TextRun({text,font:'Arial',size:18,bold:true,color:'FFFFFF'})]})]});

  // Parse briefing content from staffing_plan field
  const briefing = opp.staffing_plan || '';
  const scopeAnalysis = opp.scope_analysis || '';
  const financialAnalysis = opp.financial_analysis || '';
  const captureAction = opp.capture_action || '';
  const pwin = opp.pwin || (captureAction.match(/PWIN:\s*(\d+)/i)?.[1] || '?');
  const opi = opp.opi_score || '?';
  const rec = captureAction.match(/RECOMMENDATION:\s*(GO|CONDITIONAL GO|NO-BID)/i)?.[1] || 'GO';
  const recColor = rec === 'GO' ? '1B5E20' : rec === 'CONDITIONAL GO' ? AMBER : RED;

  // Extract sections from briefing text
  const getSection = (text, header) => {
    const re = new RegExp('##\\s*' + header + '[\\s\\S]*?(?=\\n##|$)', 'i');
    const m = text.match(re);
    return m ? m[0].replace(/^##[^\n]*\n/,'').trim() : '';
  };

  const snapshot = getSection(briefing, 'OPPORTUNITY SNAPSHOT');
  const evalSection = getSection(briefing, 'EVALUATION CRITERIA');
  const whyWins = getSection(briefing, 'WHY HGI WINS');
  const compThreats = getSection(briefing, 'COMPETITIVE THREATS');
  const financialSummary = getSection(briefing, 'FINANCIAL SUMMARY');
  const openItems = getSection(briefing, 'OPEN ITEMS');
  const actions = getSection(briefing, 'REQUIRED ACTIONS');
  const submissionReqs = getSection(briefing, 'SUBMISSION REQUIREMENTS');

  // Format plain text block as bullets
  const textToBullets = (text) => {
    if (!text) return [p('No information available.', {color:GRAY,italic:true})];
    return text.split('\n').filter(l=>l.trim()).map(line => {
      const clean = line.replace(/^[-*•]\s*/,'').replace(/^\d+\.\s*/,'').trim();
      if (!clean) return blank(40);
      const isBold = /\*\*([^*]+)\*\*/.test(clean);
      if (isBold) {
        const runs = [];
        let remaining = clean;
        const re = /\*\*([^*]+)\*\*/g;
        let last = 0, m;
        while ((m = re.exec(clean)) !== null) {
          if (m.index > last) runs.push({text:clean.slice(last,m.index)});
          runs.push({text:m[1],bold:true});
          last = m.index + m[0].length;
        }
        if (last < clean.length) runs.push({text:clean.slice(last)});
        return pRich(runs, {after:80});
      }
      if (line.trim().startsWith('-') || line.trim().startsWith('*') || /^\d+\./.test(line.trim())) {
        return bullet(clean);
      }
      return p(clean, {after:80});
    });
  };

  const deadline = opp.due_date ? new Date(opp.due_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : 'TBD';
  const genDate = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});

  const doc = new Document({
    numbering:{config:[{reference:'bullets',levels:[{level:0,format:LevelFormat.BULLET,text:'\u2022',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:540,hanging:260}}}}]}]},
    styles:{default:{document:{run:{font:'Arial',size:22}}}},
    sections:[{
      properties:{page:{size:{width:12240,height:15840},margin:{top:1080,right:1080,bottom:1080,left:1080}}},
      children:[
        // HEADER
        p('HGI GLOBAL, INC.',{bold:true,size:32,color:NAVY,after:60}),
        p('INTERNAL CAPTURE BRIEFING — CONFIDENTIAL',{bold:true,size:18,color:GOLD,after:60}),
        divider(),
        blank(80),

        // TITLE
        p(opp.agency||'Agency',{size:20,color:GRAY,after:60}),
        p(opp.title||'Opportunity',{bold:true,size:30,color:NAVY,after:60}),
        blank(140),

        // BADGES
        new Table({
          width:{size:9360,type:WidthType.DXA},
          columnWidths:[1300,1300,1000,1000,4760],
          rows:[new TableRow({children:[
            new TableCell({borders:noBorders,shading:{fill:NAVY,type:ShadingType.CLEAR},margins:{top:60,bottom:60,left:80,right:80},children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:'OPI: '+opi,font:'Arial',size:22,bold:true,color:'FFFFFF'})]})] }),
            new TableCell({borders:noBorders,shading:{fill:'2E7D32',type:ShadingType.CLEAR},margins:{top:60,bottom:60,left:80,right:80},children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:'PWIN: '+pwin+'%',font:'Arial',size:22,bold:true,color:'FFFFFF'})]})] }),
            new TableCell({borders:noBorders,shading:{fill:recColor,type:ShadingType.CLEAR},margins:{top:60,bottom:60,left:80,right:80},children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:rec,font:'Arial',size:22,bold:true,color:'FFFFFF'})]})] }),
            new TableCell({borders:noBorders,shading:{fill:GOLD,type:ShadingType.CLEAR},margins:{top:60,bottom:60,left:80,right:80},children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({text:'TIER 1',font:'Arial',size:22,bold:true,color:'FFFFFF'})]})] }),
            new TableCell({borders:noBorders,margins:{top:60,bottom:60,left:200,right:60},children:[new Paragraph({children:[new TextRun({text:'Deadline: '+deadline,font:'Arial',size:20,bold:true,color:NAVY})]})] }),
          ]})]
        }),
        blank(140),

        // INFO TABLE
        new Table({
          width:{size:9360,type:WidthType.DXA},
          columnWidths:[2400,6960],
          rows:[
            ['Agency', opp.agency||''],
            ['Solicitation', opp.title||''],
            ['Deadline', deadline],
            ['Est. Value', opp.estimated_value||'Not stated in solicitation'],
            ['Submit Via', opp.source_url||'See solicitation'],
            ['Source', opp.source==='MCP_MANUAL'?'Manually added — surfaced via relationship':('Scraper: '+(opp.source||'Unknown'))],
          ].map(([label,value])=>new TableRow({children:[
            cell(label,{width:2400,fill:LIGHT_BLUE,bold:true,color:NAVY}),
            cell(value,{width:6960}),
          ]}))
        }),
        blank(200),

        // 1 SNAPSHOT
        sectionHdr('1.  OPPORTUNITY SNAPSHOT'),
        blank(80),
        ...textToBullets(snapshot),
        blank(200),

        // 2 EVAL CRITERIA
        sectionHdr('2.  EVALUATION CRITERIA & HGI POSITIONING'),
        blank(80),
        ...textToBullets(evalSection),
        blank(200),

        // 3 WHY HGI WINS
        sectionHdr('3.  WHY HGI WINS'),
        blank(80),
        ...textToBullets(whyWins),
        blank(200),

        // 4 COMPETITIVE THREATS
        sectionHdr('4.  COMPETITIVE THREATS'),
        blank(80),
        ...textToBullets(compThreats),
        blank(200),

        // 5 FINANCIAL
        sectionHdr('5.  FINANCIAL SUMMARY'),
        blank(80),
        pRich([{text:'All values are ESTIMATED — no contract amount stated in solicitation.',bold:true,color:AMBER}],{after:100}),
        ...textToBullets(financialSummary),
        blank(200),

        // 6 OPEN ITEMS
        sectionHdr('6.  OPEN ITEMS — TEAM MUST CONFIRM BEFORE SUBMISSION'),
        blank(80),
        ...textToBullets(openItems),
        blank(200),

        // 7 ACTION PLAN
        sectionHdr('7.  REQUIRED ACTIONS'),
        blank(80),
        ...textToBullets(actions),
        blank(200),

        // 8 SUBMISSION
        sectionHdr('8.  SUBMISSION REQUIREMENTS'),
        blank(80),
        ...textToBullets(submissionReqs),
        blank(160),
        thinDivider(),
        blank(80),
        pRich([{text:'Prepared by HGI AI Capture System  |  '+genDate+'  |  ',color:GRAY,size:18},{text:'INTERNAL — DO NOT DISTRIBUTE OUTSIDE HGI',bold:true,color:RED,size:18}],{align:AlignmentType.CENTER}),
      ]
    }]
  });

  return Packer.toBuffer(doc);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const opportunity_id = req.body?.opportunity_id || req.query?.opportunity_id;
  if (!opportunity_id) return res.status(400).json({ error: 'opportunity_id required' });

  // Load opportunity
  const oppR = await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opportunity_id) + '&limit=1', { headers: H });
  const opps = await oppR.json();
  if (!opps?.length) return res.status(404).json({ error: 'Opportunity not found' });
  const opp = opps[0];

  if (!opp.staffing_plan) return res.status(400).json({ error: 'No briefing content found. Run orchestrator first.' });

  try {
    const buffer = await buildBriefingDoc(opp);

    // Upload to Supabase Storage
    const slug = (opp.agency || 'agency').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const filename = 'briefings/' + slug + '-' + Date.now() + '.docx';
    const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    const uploadR = await fetch(SUPABASE_URL + '/storage/v1/object/' + STORAGE_BUCKET + '/' + filename, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': mimeType, 'x-upsert': 'true' },
      body: buffer,
    });
    if (!uploadR.ok) throw new Error('Storage upload failed: ' + await uploadR.text());

    const downloadUrl = SUPABASE_URL + '/storage/v1/object/public/' + STORAGE_BUCKET + '/' + filename;

    // Update rfp_document_url on the opportunity record
    await fetch(SUPABASE_URL + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(opportunity_id), {
      method: 'PATCH',
      headers: { ...H, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ rfp_document_url: downloadUrl, last_updated: new Date().toISOString() }),
    });

    // If client wants the file directly (GET), stream it
    if (req.method === 'GET' || req.query?.download === 'true') {
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', 'attachment; filename="HGI_Briefing_' + slug + '.docx"');
      return res.send(Buffer.from(buffer));
    }

    return res.status(200).json({ success: true, download_url: downloadUrl, filename, opportunity_id });
  } catch (e) {
    console.error('generate-doc error:', e);
    return res.status(500).json({ error: e.message });
  }
}
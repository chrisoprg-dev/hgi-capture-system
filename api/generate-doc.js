export const config = { maxDuration: 60 };
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SERVICE_KEY;
const H = { 'apikey': SK, 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/json' };
const BUCKET = 'knowledge-docs';

function parseSections(draft) {
  var sections = [];
  var lines = draft.split('\n');
  var currentSection = null;
  var currentContent = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Match ANY bold header — works for A-G lettered, numbered, or descriptive section titles
    // Pattern: **Any section title between 3-100 chars**
    var headerMatch = line.match(/^\*\*([^\n*]{3,100})\*\*\s*$/);
    // Also match markdown headers (## Section Title)
    if (!headerMatch) {
      var mdMatch = line.match(/^#{1,3}\s+(.{3,100})$/);
      if (mdMatch) headerMatch = [null, mdMatch[1].trim()];
    }
    if (headerMatch) {
      if (currentSection) sections.push({ header: currentSection, content: currentContent.join('\n').trim(), isTopLevel: isTopLevelSection(currentSection) });
      currentSection = headerMatch[1].trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection) sections.push({ header: currentSection, content: currentContent.join('\n').trim(), isTopLevel: isTopLevelSection(currentSection) });
  return sections;
}

// Determine if a section header is top-level (warrants a page break)
// Works for: A. Executive Summary, 1. Technical Approach, ## Section Title, SECTION A, etc.
function isTopLevelSection(header) {
  if (!header) return false;
  // A-G letter sections (original format)
  if (/^[A-G]\./.test(header)) return true;
  // Numbered sections: 1. 2. 3.
  if (/^\d+\.\s+[A-Z]/.test(header)) return true;
  // ALL CAPS section headers (common in TPA, workforce RFPs)
  if (/^[A-Z][A-Z\s]{8,}$/.test(header)) return true;
  // Roman numeral sections
  if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s/.test(header)) return true;
  // Sections with significant keywords that are typically major sections
  var majorKeywords = ['executive summary', 'technical approach', 'management approach', 'past performance', 'qualifications', 'staffing', 'pricing', 'cost', 'transmittal', 'introduction', 'scope', 'methodology', 'experience', 'references'];
  var lh = header.toLowerCase();
  return majorKeywords.some(function(k) { return lh.indexOf(k) !== -1 && header.length < 60; });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  var oppId = (req.query && req.query.opp) || (req.body && req.body.opportunity_id) || '';
  if (!oppId) return res.status(400).json({ error: 'opp query param or opportunity_id required' });
  try {
    var oppR = await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(oppId) + '&limit=1&select=id,title,agency,staffing_plan', { headers: H });
    var opps = await oppR.json();
    if (!opps || !opps.length) return res.status(404).json({ error: 'Opportunity not found' });
    var opp = opps[0];
    var draft = opp.staffing_plan || '';
    if (draft.length < 500) return res.status(200).json({ error: 'No substantial draft', chars: draft.length });
    var title = opp.title || 'HGI Proposal';
    var agency = opp.agency || 'Agency';
    var m = await import('docx');
    var Document = m.Document, Packer = m.Packer, Paragraph = m.Paragraph, TextRun = m.TextRun;
    var HeadingLevel = m.HeadingLevel, AlignmentType = m.AlignmentType, BorderStyle = m.BorderStyle;
    var ShadingType = m.ShadingType, Header = m.Header, Footer = m.Footer, PageNumber = m.PageNumber;
    var PageBreak = m.PageBreak, LevelFormat = m.LevelFormat, TabStopType = m.TabStopType;
    var currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    var truncTitle = title.length > 60 ? title.substring(0, 60) + '...' : title;
    var sections = parseSections(draft);
    var preA = draft.split('**A.')[0] || '';
    var tStart = preA.indexOf('Dear ');
    var transmittal = tStart > -1 ? preA.substring(tStart).trim() : '';
    var children = [];
    children.push(
      new Paragraph({ spacing: { before: 2400 }, children: [] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'HAMMERMAN & GAINER LLC', font: 'Arial', size: 48, bold: true, color: 'C9A84C' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'Established 1929 \u00B7 96 Years of Excellence', font: 'Arial', size: 24, color: '666666' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: title, font: 'Arial', size: 32, bold: true, color: '1F3864' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'Submitted to:', font: 'Arial', size: 22 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: agency, font: 'Arial', size: 28, bold: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: currentDate, font: 'Arial', size: 22 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: 'CONFIDENTIAL PROPOSAL', font: 'Arial', size: 22, bold: true, color: '1F3864' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'Christopher J. Oney, President', font: 'Arial', size: 22, bold: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new TextRun({ text: 'christophero@hgi-global.com | (504) 982-5030', font: 'Arial', size: 20 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: '2400 Veterans Memorial Blvd, Suite 200, Kenner, LA 70062', font: 'Arial', size: 20 })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'SAM UEI: DL4SJEVKZ6H4 | CAGE Code: 47G60', font: 'Arial', size: 20, color: '666666' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '100% Minority-Owned | Louisiana-Based', font: 'Arial', size: 20, color: '666666' })] }),
      new Paragraph({ children: [new PageBreak()] })
    );
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F3864', space: 1 } }, children: [new TextRun({ text: 'TABLE OF CONTENTS', font: 'Arial', size: 32, bold: true, color: '1F3864' })] }));
    for (var si = 0; si < sections.length; si++) {
      children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: sections[si].header, font: 'Arial', size: 22 })] }));
    }
    children.push(new Paragraph({ children: [new PageBreak()] }));
    if (transmittal.length > 50) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F3864', space: 1 } }, children: [new TextRun({ text: 'Transmittal Letter', font: 'Arial', size: 32, bold: true, color: '1F3864' })] }));
      var tLines = transmittal.split('\n');
      for (var ti = 0; ti < tLines.length; ti++) {
        if (tLines[ti].trim()) children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: tLines[ti].trim(), font: 'Arial', size: 22 })] }));
      }
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 240 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1F3864', space: 1 } }, children: [new TextRun({ text: sec.header, font: 'Arial', size: 32, bold: true, color: '1F3864' })] }));
      var cLines = sec.content.split('\n');
      for (var ci = 0; ci < cLines.length; ci++) {
        var cl = cLines[ci].trim();
        if (!cl) continue;
        var subMatch = cl.match(/^\*\*([A-G]\.\d+\s*.+?)\*\*/);
        if (subMatch) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: subMatch[1], font: 'Arial', size: 26, bold: true, color: '2E5DA6' })] })); continue; }
        var boldMatch = cl.match(/^\*\*(.+?)\*\*/);
        if (boldMatch) { children.push(new Paragraph({ spacing: { before: 120, after: 80 }, children: [new TextRun({ text: boldMatch[1], font: 'Arial', size: 22, bold: true })] })); continue; }
        if (cl.startsWith('- ') || cl.startsWith('\u2022 ')) { children.push(new Paragraph({ numbering: { reference: 'hgi-bullets', level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: cl.substring(2), font: 'Arial', size: 22 })] })); continue; }
        if (cl.includes('[ACTION REQUIRED]')) { children.push(new Paragraph({ spacing: { after: 80 }, shading: { fill: 'FFF3CD', type: ShadingType.CLEAR }, children: [new TextRun({ text: cl, font: 'Arial', size: 22, bold: true, color: '856404' })] })); continue; }
        children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: cl, font: 'Arial', size: 22 })] }));
      }
      if (sec.isTopLevel) children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    var doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 22 } } }, paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, font: 'Arial', color: '1F3864' }, paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 26, bold: true, font: 'Arial', color: '2E5DA6' }, paragraph: { spacing: { before: 180, after: 120 }, outlineLevel: 1 } }
      ] },
      numbering: { config: [{ reference: 'hgi-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
      sections: [{
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        headers: {
          default: new Header({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: 9360 }], children: [new TextRun({ text: 'HGI \u2014 ' + truncTitle, font: 'Arial', size: 18, color: '999999' }), new TextRun({ text: '\t' }), new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '999999' })] })] }),
          first: new Header({ children: [] })
        },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Hammerman & Gainer LLC \u00B7 Confidential \u00B7 ' + currentDate, font: 'Arial', size: 18, color: '999999' })] })] }) },
        children: children
      }]
    });
    var buffer = await Packer.toBuffer(doc);
    var filename = 'proposals/HGI_Proposal_' + agency.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '.docx';
    await fetch(SB + '/storage/v1/object/' + BUCKET + '/' + filename, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SK, 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'x-upsert': 'true' },
      body: buffer
    });
    var downloadUrl = SB + '/storage/v1/object/public/' + BUCKET + '/' + filename;
    try {
      await fetch(SB + '/rest/v1/opportunities?id=eq.' + encodeURIComponent(oppId), {
        method: 'PATCH', headers: H,
        body: JSON.stringify({ rfp_document_url: downloadUrl, last_updated: new Date().toISOString() })
      });
    } catch(e) {}
    return res.status(200).json({ success: true, opportunity_id: oppId, title: title, agency: agency, draft_chars: draft.length, sections_parsed: sections.length, doc_bytes: buffer.length, download_url: downloadUrl, filename: filename });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
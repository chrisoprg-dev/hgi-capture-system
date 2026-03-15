export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, ShadingType, WidthType, Table, TableRow, TableCell, PageBreak, Header, Footer, PageNumber, LevelFormat, TabStopType } = await import('docx');
    
    const { title, agency, sections, metadata } = req.body;

    if (!title || !agency || !sections) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sectionLabels = {
      executive_summary: "Executive Summary",
      technical_approach: "Technical Approach",
      management_approach: "Management Approach",
      staffing_plan: "Staffing Plan",
      past_performance: "Past Performance",
      transition_plan: "Transition & Mobilization Plan",
      pricing_narrative: "Pricing Narrative",
      compliance_matrix: "Compliance Matrix",
      clarifying_questions: "Clarifying Questions",
      red_team: "Red Team Critique"
    };

    const sectionOrder = [
      'executive_summary', 'technical_approach', 'management_approach',
      'staffing_plan', 'past_performance', 'transition_plan',
      'pricing_narrative', 'compliance_matrix', 'clarifying_questions', 'red_team'
    ];

    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const truncatedTitle = title.length > 60 ? title.substring(0, 60) + '...' : title;

    const headerConfig = {
      default: new Header({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `HGI — ${truncatedTitle}`,
                font: 'Arial',
                size: 20
              }),
              new TextRun({
                text: '\t',
                font: 'Arial'
              }),
              new TextRun({
                children: [PageNumber.CURRENT],
                font: 'Arial',
                size: 20
              })
            ],
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: 9360
              }
            ]
          })
        ]
      }),
      first: new Header({
        children: []
      })
    };

    const footerConfig = {
      default: new Footer({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: `Hammerman & Gainer LLC · Confidential · ${currentDate}`,
                font: 'Arial',
                size: 20
              })
            ],
            alignment: AlignmentType.CENTER
          })
        ]
      })
    };

    const documentChildren = [];

    // Cover Page
    documentChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "HAMMERMAN & GAINER LLC",
            font: 'Arial',
            size: 48,
            bold: true,
            color: "C9A84C"
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "Established 1929 · 97 Years of Excellence",
            font: 'Arial',
            size: 24
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            font: 'Arial',
            size: 32,
            bold: true
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Submitted to: ${agency}`,
            font: 'Arial',
            size: 24
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: currentDate,
            font: 'Arial',
            size: 20
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "CONFIDENTIAL PROPOSAL",
            font: 'Arial',
            size: 20,
            bold: true
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "Christopher J. Oney, President",
            font: 'Arial',
            size: 20,
            bold: true
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "christophero@hgi-global.com",
            font: 'Arial',
            size: 20
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "504-982-5030",
            font: 'Arial',
            size: 20
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 }
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: "Hammerman & Gainer LLC | Kenner, Louisiana",
            font: 'Arial',
            size: 20
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 }
      }),
      new Paragraph({ children: [new PageBreak()] })
    );

    // Table of Contents
    documentChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "TABLE OF CONTENTS",
            font: 'Arial',
            size: 36,
            bold: true,
            color: "1F3864"
          })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
        border: {
          bottom: {
            color: "1F3864",
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6
          }
        }
      })
    );

    sectionOrder.forEach(key => {
      if (sections[key]) {
        documentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: sectionLabels[key],
                font: 'Arial',
                size: 24
              })
            ],
            spacing: { after: 120 }
          })
        );
      }
    });

    documentChildren.push(new Paragraph({ children: [new PageBreak()] }));

    // Process sections
    sectionOrder.forEach(sectionKey => {
      if (sections[sectionKey]) {
        const sectionLabel = sectionLabels[sectionKey];
        const content = sections[sectionKey];

        // Section heading
        documentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: sectionLabel,
                font: 'Arial',
                size: 36,
                bold: true,
                color: "1F3864"
              })
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 480, after: 240 },
            border: {
              bottom: {
                color: "1F3864",
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6
              }
            }
          })
        );

        if (sectionKey === 'past_performance') {
          // Try to parse as table data first
          const lines = content.split('\n').filter(line => line.trim());
          let isTable = false;
          const tableRows = [];
          
          lines.forEach(line => {
            if (line.includes('|')) {
              isTable = true;
              const cells = line.split('|').map(cell => cell.trim());
              if (cells.length === 5) {
                tableRows.push(cells);
              }
            }
          });

          if (isTable && tableRows.length > 0) {
            const table = new Table({
              width: { size: 9360, type: WidthType.DXA },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "Program", bold: true, font: 'Arial', size: 20 })] })],
                      width: { size: 1872, type: WidthType.DXA },
                      shading: { fill: "E6E6E6", type: ShadingType.CLEAR }
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "Client", bold: true, font: 'Arial', size: 20 })] })],
                      width: { size: 1872, type: WidthType.DXA },
                      shading: { fill: "E6E6E6", type: ShadingType.CLEAR }
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "Value", bold: true, font: 'Arial', size: 20 })] })],
                      width: { size: 1872, type: WidthType.DXA },
                      shading: { fill: "E6E6E6", type: ShadingType.CLEAR }
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "Role", bold: true, font: 'Arial', size: 20 })] })],
                      width: { size: 1872, type: WidthType.DXA },
                      shading: { fill: "E6E6E6", type: ShadingType.CLEAR }
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "Outcome", bold: true, font: 'Arial', size: 20 })] })],
                      width: { size: 1872, type: WidthType.DXA },
                      shading: { fill: "E6E6E6", type: ShadingType.CLEAR }
                    })
                  ]
                }),
                ...tableRows.map(row => new TableRow({
                  children: row.map(cell => new TableCell({
                    children: [new Paragraph({ 
                      children: [new TextRun({ text: cell, font: 'Arial', size: 20 })] 
                    })],
                    width: { size: 1872, type: WidthType.DXA }
                  }))
                }))
              ]
            });
            documentChildren.push(table);
          } else {
            // Process as regular text
            processTextContent(content, documentChildren, { Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat });
          }
        } else if (sectionKey === 'compliance_matrix') {
          const lines = content.split('\n').filter(line => line.trim());
          const tableRows = [];
          
          lines.forEach(line => {
            const match = line.match(/^(\d+\.?\s*.+?)\s*[-–—]\s*(.+)$/);
            if (match) {
              tableRows.push([match[1].trim(), match[2].trim()]);
            }
          });

          if (tableRows.length > 0) {
            const table = new Table({
              width: { size: 9360, type: WidthType.DXA },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "RFP Requirement", bold: true, font: 'Arial', size: 20 })] })],
                      width: { size: 4680, type: WidthType.DXA },
                      shading: { fill: "E6E6E6", type: ShadingType.CLEAR }
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: "Where Addressed", bold: true, font: 'Arial', size: 20 })] })],
                      width: { size: 4680, type: WidthType.DXA },
                      shading: { fill: "E6E6E6", type: ShadingType.CLEAR }
                    })
                  ]
                }),
                ...tableRows.map(row => new TableRow({
                  children: [
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: row[0], font: 'Arial', size: 20 })] })],
                      width: { size: 4680, type: WidthType.DXA }
                    }),
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: row[1], font: 'Arial', size: 20 })] })],
                      width: { size: 4680, type: WidthType.DXA }
                    })
                  ]
                }))
              ]
            });
            documentChildren.push(table);
          } else {
            processTextContent(content, documentChildren, { Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat });
          }
        } else {
          processTextContent(content, documentChildren, { Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat });
        }

        documentChildren.push(new Paragraph({ children: [new PageBreak()] }));
      }
    });

    const doc = new Document({
      numbering: {
        config: [{
          reference: 'hgi-bullets',
          levels: [{ 
            level: 0, 
            format: LevelFormat.BULLET, 
            text: '•', 
            alignment: AlignmentType.LEFT,
            style: { 
              paragraph: { 
                indent: { left: 720, hanging: 360 } 
              } 
            } 
          }]
        }]
      },
      sections: [{
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840,
            },
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: headerConfig,
        footers: footerConfig,
        children: documentChildren
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `HGI_Proposal_${agency.replace(/[^a-zA-Z0-9]/g, '_')}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (error) {
    console.error('Error generating document:', error);
    res.status(500).json({ error: error.message });
  }
}

function processTextContent(content, documentChildren, { Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat }) {
  const lines = content.split('\n').filter(line => line.trim());
  let bulletItems = [];

  const flushBulletItems = () => {
    if (bulletItems.length > 0) {
      bulletItems.forEach(item => {
        documentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: item,
                font: 'Arial',
                size: 24
              })
            ],
            numbering: {
              reference: 'hgi-bullets',
              level: 0
            },
            spacing: { after: 120, line: 276 }
          })
        );
      });
      bulletItems = [];
    }
  };

  lines.forEach(line => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('## ')) {
      flushBulletItems();
      documentChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed.substring(3),
              font: 'Arial',
              size: 28,
              bold: true,
              color: "2E5DA6"
            })
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 }
        })
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      bulletItems.push(trimmed.substring(2));
    } else if (trimmed) {
      flushBulletItems();
      documentChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: trimmed,
              font: 'Arial',
              size: 24
            })
          ],
          spacing: { after: 120, line: 276 }
        })
      );
    }
  });

  flushBulletItems();
}
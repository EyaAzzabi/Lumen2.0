"""Decision exports use stored revision evidence, never the working draft."""
from io import BytesIO
from xml.sax.saxutils import escape

TITLE = 'PLUME Coordination Decision Dossier'
LIMITS = [
    'Simplified ballistic ejecta model on synthetic terrain; not experimentally calibrated.',
    'Mean modeled damage is not a failure probability. Financial values are fictional scenario inputs.',
    'Sample quantiles are not validated confidence intervals. Footprints use a reference solar array at nominal touchdown.',
    'Optimization covers evaluated candidates only: neither global optimality nor global impossibility is established.',
    'Coordination requires explicit responses on the current revision. It is not regulatory clearance, certification or an official signature.',
    'Illustrative particles do not represent a time-resolved physical simulation.',
]


def pdf_bytes(data):
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    styles = getSampleStyleSheet()
    styles['Normal'].fontSize = 9
    styles['Normal'].leading = 13
    stream = BytesIO()
    doc = SimpleDocTemplate(stream, title=TITLE, author='PLUME', leftMargin=42, rightMargin=42, topMargin=42, bottomMargin=42)
    story = []
    def cell(value):
        return Paragraph(escape(str(value if value is not None else 'Not recorded')), styles['Normal'])
    def paragraph(text, style='Normal'):
        story.append(Paragraph(escape(str(text)), styles[style]))
    def section(title):
        story.append(Spacer(1, 10))
        paragraph(title, 'Heading2')
    def table(headers, records, widths=None):
        if not records:
            paragraph('None recorded.')
            return
        rows = [[cell(c) for c in headers]] + [[cell(c) for c in row] for row in records]
        t = Table(rows, colWidths=widths, repeatRows=1, hAlign='LEFT')
        t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8eef4')),
            ('VALIGN',(0,0),(-1,-1),'TOP'),
            ('LINEBELOW',(0,0),(-1,0),.6,colors.HexColor('#65798e')),
            ('LINEBELOW',(0,1),(-1,-1),.25,colors.HexColor('#d4dde5')),
            ('LEFTPADDING',(0,0),(-1,-1),6),('RIGHTPADDING',(0,0),(-1,-1),6),
            ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
        ]))
        story.append(t)
    def fields(value):
        table(['Field','Recorded value'], [[k, v] for k,v in value.items()], [155,356])
    def number(value):
        return f'{value:.8g}' if isinstance(value,(float,int)) else str(value if value is not None else 'Not recorded')
    def checks(rules):
        table(['Equipment / reason','Maximum mean damage','Minimum distance / m','Result at filing'], [[
            f"{r['asset_id']}: {r['reason']}",
            'Not set' if r.get('max_damage_fraction') is None else number(r['max_damage_fraction']*100)+'%',
            r.get('min_separation_m') if r.get('min_separation_m') is not None else 'Not set',
            ('Satisfied' if r['satisfied'] else 'Not satisfied') + f"; actual damage {number(r.get('actual_damage_fraction'))} fraction; distance {number(r.get('actual_distance_m'))} m" if 'satisfied' in r else 'See filing checks',
        ] for r in rules], [160,95,95,161])
    frozen = data['frozen_revision']
    p = frozen['plan']
    snap = frozen['snapshot'] or {}
    paragraph(TITLE, 'Title')
    paragraph('Historical model evidence. Live coordination is labeled separately.')
    section(f"{p['name']} / revision {p.get('revision',1)}")
    fields({'Mission':p['id'], 'Organization':(snap.get('organization') or {}).get('name',p['operator_id']),
        'Revision':p.get('revision',1), 'Local site / m':f"E {p['site']['x']} / N {p['site']['y']}",
        'Mission window / UTC':p['window'], 'Evaluation date / UTC':snap.get('computed_at'),
        'Historical modeled loss / million EUR':number(p['summary']['expected_loss_meur'])})
    section('Spacecraft parameters')
    fields(p['lander'])
    section('Model and terrain provenance')
    provenance = snap.get('provenance') or {}
    fields({k:v for k,v in provenance.items() if not isinstance(v,(dict,list))})
    for key in ('terrain','model','calibration_reference'):
        if key in provenance:
            paragraph(f'{key}: {provenance[key]}')
    for assumption in provenance.get('assumptions',[]):
        paragraph(assumption)
    if not snap:
        paragraph('Legacy record: full original assessment unavailable; not reconstructed.')
    story.append(PageBreak())
    section('Equipment and historical assessment')
    results = {r['asset_id']:r for r in (snap.get('assessment') or {}).get('assets',[])}
    table(['Equipment / owner','Local E / N (m)','Value / million EUR','Mean damage / %','Loss / million EUR'], [[
        f"{a['name']} ({a['id']}) / {a['operator_id']} / {a['type']}",
        f"{number(a['x'])} / {number(a['y'])}", number(a['value_meur']),
        number(results[a['id']]['damage_fraction']*100) if a['id'] in results else 'Not recorded',
        number(results[a['id']]['expected_loss_meur']) if a['id'] in results else 'Not recorded',
    ] for a in snap.get('assets',[])], [170,95,82,82,82])
    for asset_id, r in results.items():
        paragraph(f"{asset_id}: {r.get('risk')}; mechanisms {r.get('mechanisms')}; sample q95 {number((r.get('uncertainty') or {}).get('q95'))}. Quantiles are not validated confidence intervals.")
    section('Structured objections and negotiated requirements')
    checks(snap.get('coordination_constraints',[]))
    section('Constraint checks at filing')
    checks((snap.get('constraint_evaluation') or {}).get('checks',[]))
    section('Optimization and retained alternatives')
    evidence = snap.get('optimization')
    if evidence:
        result = evidence['result']
        fields({'Run':evidence['id'],'Computed / Unix seconds UTC':evidence['created_at'],
            'Source revision':evidence.get('plan_revision'), 'Scope':result.get('constraint_scope'),
            'Status':result.get('constraint_status'), 'Adopted local site / m':f"E {p['site']['x']} / N {p['site']['y']}"})
        fields({k:v for k,v in evidence['inputs'].items() if k not in ('lander','constraints')})
        candidates = [('Best evaluated',result.get('best_explanation'))] + [('Alternative',c) for c in result.get('alternatives',[])] + [('Rejected',c) for c in result.get('near_misses',[])]
        table(['Candidate / E / N (m)','Slope / degrees','Move / m','Loss / million EUR','Total / million EUR','Constraints'],[[
            f"{label}: {number(c['x'])} / {number(c['y'])}",number(c['slope_deg']),number(c['distance_from_target_m']),
            number(c['expected_loss_meur']),number(c['total_cost_meur']),
            'Satisfied' if (c.get('constraint_evaluation') or {}).get('satisfied') else 'Rejected',
        ] for label,c in candidates if c], [145,65,65,80,80,76])
        paragraph('Objective = modeled infrastructure loss + relocation cost. Complete candidate search and original numeric results are retained in the structured JSON export.')
    else:
        paragraph('No optimization evidence was recorded for this revision.')
    section('Revision history through selected revision')
    table(['Revision','Local site / m','Historical loss / million EUR'], [[r['revision'],r['site'],number((r.get('summary') or {}).get('expected_loss_meur'))] for r in frozen['revision_history']], [70,280,161])
    def consultations(notices):
        records=[]
        for n in notices or []:
            records.append([n.get('revision',1),n['to_operator_id'],n['status'],n.get('reply') or 'No response comment'])
            for r in n.get('response_history',[]):
                records.append([n.get('revision',1),r.get('organization_id'),r['status'],f"{r.get('reply') or 'No comment'} / UTC Unix seconds {r.get('created_at')}"])
        table(['Revision','Recipient','Status','Recorded explanation / response time'],records,[55,100,100,256])
    section('Consultations recorded by filing time - frozen')
    consultations(frozen['consultations_at_filing'])
    story.append(PageBreak())
    section('Live coordination - can change after download')
    live=data['current_coordination']
    fields({k:v for k,v in live.items() if not isinstance(v,(dict,list))})
    consultations(live['visible_consultations'])
    section('Append-only coordination events - live history')
    table(['Event','Actor','UTC Unix seconds'], [[e['type'],e.get('actor_id'),e['created_at']] for e in live['events']], [215,170,126])
    section('Scientific assumptions and limits')
    for limit in LIMITS:
        paragraph(limit)
        story.append(Spacer(1,5))
    def footer(canvas, document):
        canvas.setFont('Helvetica',8)
        canvas.setFillColor(colors.HexColor('#32465b'))
        canvas.drawString(42,24,'PLUME | Historical model evidence | No safety certification')
        canvas.drawRightString(550,24,str(document.page))
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return stream.getvalue()

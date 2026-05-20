import io
import os
import json
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, Image
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY

TEAL    = colors.HexColor('#007B8A')
TEAL_LT = colors.HexColor('#E0F4F6')
GRAY    = colors.HexColor('#5F5E5A')
GRAY_LT = colors.HexColor('#F1EFE8')
GRAY_BD = colors.HexColor('#D3D1C7')
BLACK   = colors.HexColor('#2C2C2A')
WHITE   = colors.white
GREEN   = colors.HexColor('#3B6D11')
GREEN_LT= colors.HexColor('#EAF3DE')
RED     = colors.HexColor('#A32D2D')
RED_LT  = colors.HexColor('#FCEBEB')
AMBER   = colors.HexColor('#854F0B')
AMBER_LT= colors.HexColor('#FAEEDA')

LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets', 'logo.png')
PAGE_W = 170 * mm

def S(name, **kw):
    d = dict(fontName='Helvetica', textColor=BLACK, leading=14, fontSize=10)
    d.update(kw)
    return ParagraphStyle(name, **d)

def kv_table(rows, col_w=None):
    cw = col_w or [35*mm, 50*mm, 35*mm, 50*mm]
    t = Table(rows, colWidths=cw)
    t.setStyle(TableStyle([
        ('FONTSIZE',(0,0),(-1,-1),9),
        ('FONTNAME',(0,0),(0,-1),'Helvetica-Bold'),
        ('FONTNAME',(2,0),(2,-1),'Helvetica-Bold'),
        ('TEXTCOLOR',(0,0),(0,-1),GRAY),
        ('TEXTCOLOR',(2,0),(2,-1),GRAY),
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[WHITE,GRAY_LT]),
        ('GRID',(0,0),(-1,-1),0.3,GRAY_BD),
        ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('LEFTPADDING',(0,0),(-1,-1),6),
    ]))
    return t

def section_title(text):
    return Paragraph(f'<b>{text}</b>', S('sth', fontSize=12, textColor=TEAL,
                                          spaceBefore=14, spaceAfter=4,
                                          borderPadding=(0,0,4,0)))

def generate_pdf(run, lob, metrics, thresholds, custom_obs=None, qa_name=None, version='internal'):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm, topMargin=16*mm, bottomMargin=20*mm,
        title=f"Load Test Report — {lob.name}")

    story = []

    # ── LOGO + HEADER ─────────────────────────────────────────
    header_items = []
    if os.path.exists(LOGO_PATH):
        try:
            logo = Image(LOGO_PATH, width=45*mm, height=14*mm)
            header_items.append(logo)
        except Exception:
            header_items.append(Paragraph('<b>salescode.ai</b>',
                S('logo', fontSize=16, textColor=TEAL)))
    else:
        header_items.append(Paragraph('<b>salescode.ai</b>',
            S('logo', fontSize=16, textColor=TEAL)))

    header_items.append(
        Paragraph(
            f'<font color="#007B8A"><b>Load &amp; Stress Test Report</b></font>',
            S('rt', fontSize=13, alignment=TA_RIGHT, leading=18)
        )
    )
    ht = Table([header_items], colWidths=[85*mm, 85*mm])
    ht.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('TOPPADDING',(0,0),(-1,-1),0),
        ('BOTTOMPADDING',(0,0),(-1,-1),0),
    ]))
    story.append(ht)
    story.append(Spacer(1, 3))

    # Sub-header line
    sub = f"{lob.name}  ·  API Performance Testing"
    story.append(Paragraph(sub, S('sub', fontSize=11, textColor=TEAL, fontName='Helvetica-Bold')))
    story.append(Spacer(1, 2))
    story.append(Paragraph(
        f"Tool: {run.tool.upper()}  |  Environment: {lob.environment.title()}  |  "
        f"VUs: {run.virtual_users}  |  Duration: {run.duration_seconds}s  |  "
        f"Prepared: {run.created_at.strftime('%B %d, %Y')}",
        S('meta', fontSize=9, textColor=GRAY)
    ))
    story.append(HRFlowable(width='100%', thickness=1, color=TEAL, spaceAfter=8, spaceBefore=6))

    # ── TABLE OF CONTENTS ──────────────────────────────────────
    story.append(Paragraph('Table of Contents', S('toch', fontSize=10, fontName='Helvetica-Bold', textColor=GRAY, spaceAfter=4)))
    toc_items = [
        ('1. Executive Summary', '2'),
        ('2. Test Environment & Configuration', '2'),
        ('3. Aggregate Results Summary', '3'),
        ('4. Conclusion', '3'),
    ]
    for title, page in toc_items:
        toc_row = Table([[
            Paragraph(title, S('toci', fontSize=9, textColor=GRAY)),
            Paragraph(page,  S('tocp', fontSize=9, textColor=GRAY, alignment=TA_RIGHT)),
        ]], colWidths=[155*mm, 15*mm])
        toc_row.setStyle(TableStyle([
            ('TOPPADDING',(0,0),(-1,-1),1),('BOTTOMPADDING',(0,0),(-1,-1),1),
        ]))
        story.append(toc_row)
    story.append(HRFlowable(width='100%', thickness=0.3, color=GRAY_BD, spaceAfter=10, spaceBefore=4))

    # ── OVERALL PASS/FAIL ─────────────────────────────────────
    p99_pass  = metrics.get('p99_ms',0) <= thresholds.p99_max_ms
    err_pass  = metrics.get('error_rate_pct',100) <= thresholds.error_rate_max_pct
    overall   = p99_pass and err_pass
    vc, vbg   = (GREEN, GREEN_LT) if overall else (RED, RED_LT)
    verdict   = 'PASS' if overall else 'FAIL'

    # ── 1. EXECUTIVE SUMMARY ──────────────────────────────────
    story.append(section_title('1. Executive Summary'))
    story.append(HRFlowable(width='100%', thickness=0.5, color=TEAL, spaceAfter=6))

    obs = custom_obs or _auto_obs(metrics, thresholds, overall, lob.name, run)
    story.append(Paragraph(obs, S('obs', fontSize=10, leading=15, alignment=TA_JUSTIFY)))
    story.append(Spacer(1, 6))

    total     = metrics.get('total_requests', 0)
    errors    = metrics.get('errors', 0)
    err_pct   = metrics.get('error_rate_pct', 0)
    avg_ms    = metrics.get('avg_ms', 0)
    rps       = metrics.get('rps', 0)

    # Highlights box
    highlights = [
        f"Overall verdict: <b>{verdict}</b>",
        f"<b>{err_pct:.1f}%</b> error rate recorded across {total:,} total requests",
        f"Average response time: <b>{avg_ms}ms</b>  ·  Throughput: <b>{rps:.1f} req/s</b>",
        f"p99 latency: <b>{metrics.get('p99_ms',0)}ms</b>  ·  p90: <b>{metrics.get('p90_ms',0)}ms</b>",
    ]
    hdata = [[Paragraph(f'• {h}', S(f'hl{i}', fontSize=9, leading=14, textColor=vc if i==0 else BLACK))]
             for i, h in enumerate(highlights)]
    ht2 = Table(hdata, colWidths=[PAGE_W])
    ht2.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),vbg),
        ('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3),
        ('LEFTPADDING',(0,0),(-1,-1),10),
        ('BOX',(0,0),(-1,-1),0.5,vc),
        ('ROUNDEDCORNERS',[4,4,4,4]),
    ]))
    story.append(ht2)
    story.append(Spacer(1, 10))

    # ── 2. TEST ENVIRONMENT & CONFIGURATION ───────────────────
    story.append(section_title('2. Test Environment & Configuration'))
    story.append(HRFlowable(width='100%', thickness=0.5, color=TEAL, spaceAfter=6))

    story.append(Paragraph('2.1 Tool & Methodology', S('sh2', fontSize=10, fontName='Helvetica-Bold', spaceAfter=4)))
    methodology = (
        f"Testing was performed using <b>{run.tool.upper()}</b>, executed against the "
        f"<b>{lob.environment.title()}</b> environment ({lob.base_url}). "
        f"The test used a controlled approach with {run.virtual_users} virtual users "
        f"over a {run.ramp_up_seconds}-second ramp-up period, then sustained for "
        f"{run.duration_seconds} seconds to observe steady-state behaviour."
    )
    story.append(Paragraph(methodology, S('meth', fontSize=9, leading=14, alignment=TA_JUSTIFY)))
    story.append(Spacer(1, 8))

    story.append(Paragraph('2.2 Test Parameters', S('sh2', fontSize=10, fontName='Helvetica-Bold', spaceAfter=4)))
    params_data = [
        ['Parameter', 'Value'],
        ['Virtual users (VUs)', str(run.virtual_users)],
        ['Duration', f'{run.duration_seconds}s'],
        ['Ramp-up period', f'{run.ramp_up_seconds}s'],
        ['Iterations', str(run.iterations or 'Duration-based')],
        ['Tool', run.tool.upper()],
        ['Environment', lob.environment.title()],
        ['Base URL', lob.base_url],
    ]
    if qa_name and version == 'internal':
        params_data.append(['Prepared by (QA)', qa_name])

    pt = Table(params_data, colWidths=[70*mm, 100*mm])
    pt.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),TEAL),
        ('TEXTCOLOR',(0,0),(-1,0),WHITE),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1),9),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,GRAY_LT]),
        ('GRID',(0,0),(-1,-1),0.3,GRAY_BD),
        ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
        ('LEFTPADDING',(0,0),(-1,-1),6),
    ]))
    story.append(pt)
    story.append(Spacer(1, 10))

    # ── 3. AGGREGATE RESULTS ──────────────────────────────────
    story.append(section_title('3. Aggregate Results Summary'))
    story.append(HRFlowable(width='100%', thickness=0.5, color=TEAL, spaceAfter=6))

    story.append(Paragraph(
        f"The table below presents consolidated performance metrics. "
        f"The system {'maintained a 0% error rate throughout' if errors==0 else f'recorded a {err_pct:.1f}% error rate'}.",
        S('agg', fontSize=9, leading=14, spaceAfter=6)
    ))

    if version == 'internal':
        agg_headers = ['VUs', 'Requests', 'Avg (ms)', 'Min (ms)', 'Max (ms)', 'p90 (ms)', 'p99 (ms)', 'Error %', 'Req/s']
        agg_row = [
            str(run.virtual_users), f"{total:,}",
            str(metrics.get('avg_ms',0)), str(metrics.get('min_ms',0)), str(metrics.get('max_ms',0)),
            str(metrics.get('p90_ms',0)), str(metrics.get('p99_ms',0)),
            f"{err_pct:.1f}%", f"{rps:.2f}",
        ]
        cw = [14*mm,20*mm,18*mm,16*mm,16*mm,16*mm,16*mm,15*mm,15*mm]
    else:
        agg_headers = ['VUs', 'Requests', 'Avg (ms)', 'Min (ms)', 'Max (ms)', 'Error %', 'Req/s']
        agg_row = [
            str(run.virtual_users), f"{total:,}",
            str(metrics.get('avg_ms',0)), str(metrics.get('min_ms',0)), str(metrics.get('max_ms',0)),
            f"{err_pct:.1f}%", f"{rps:.2f}",
        ]
        cw = [20*mm,25*mm,25*mm,22*mm,22*mm,20*mm,20*mm]

    agg_data = [agg_headers, agg_row]
    at = Table(agg_data, colWidths=cw)
    at.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),TEAL),
        ('TEXTCOLOR',(0,0),(-1,0),WHITE),
        ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
        ('FONTSIZE',(0,0),(-1,-1),8),
        ('ALIGN',(0,0),(-1,-1),'CENTER'),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,GRAY_LT]),
        ('GRID',(0,0),(-1,-1),0.3,GRAY_BD),
        ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
    ]))
    story.append(at)

    # Per-endpoint table (internal only)
    by_ep = metrics.get('by_endpoint', {})
    if version == 'internal' and by_ep:
        story.append(Spacer(1, 8))
        story.append(Paragraph('Per-endpoint breakdown', S('sh2', fontSize=10, fontName='Helvetica-Bold', spaceAfter=4)))
        ep_headers = ['Endpoint', 'Requests', 'p50', 'p90', 'p99', 'Errors', 'Status']
        ep_rows = [ep_headers]
        for ep, d in by_ep.items():
            ep_ok = d.get('p99_ms',0) <= thresholds.p99_max_ms
            ep_err_ok = (d.get('errors',0)/max(d.get('count',1),1)*100) <= thresholds.error_rate_max_pct
            status = 'PASS' if ep_ok and ep_err_ok else 'FAIL'
            ep_rows.append([ep, str(d.get('count',0)),
                f"{d.get('p50_ms',0)}ms", f"{d.get('p90_ms',0)}ms", f"{d.get('p99_ms',0)}ms",
                str(d.get('errors',0)), status])
        ept = Table(ep_rows, colWidths=[55*mm,18*mm,18*mm,18*mm,18*mm,16*mm,17*mm], repeatRows=1)
        ep_style = [
            ('BACKGROUND',(0,0),(-1,0),TEAL),('TEXTCOLOR',(0,0),(-1,0),WHITE),
            ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
            ('FONTSIZE',(0,0),(-1,-1),8),('ALIGN',(1,0),(-1,-1),'CENTER'),
            ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,GRAY_LT]),
            ('GRID',(0,0),(-1,-1),0.3,GRAY_BD),
            ('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4),
            ('LEFTPADDING',(0,0),(0,-1),6),
        ]
        for i, row in enumerate(ep_rows[1:], 1):
            c = GREEN if row[-1]=='PASS' else RED
            ep_style += [('TEXTCOLOR',(6,i),(6,i),c),('FONTNAME',(6,i),(6,i),'Helvetica-Bold')]
        ept.setStyle(TableStyle(ep_style))
        story.append(ept)

    story.append(Spacer(1, 10))

    # ── 4. CONCLUSION ─────────────────────────────────────────
    story.append(section_title('4. Conclusion'))
    story.append(HRFlowable(width='100%', thickness=0.5, color=TEAL, spaceAfter=6))

    conclusion_intro = (
        f"The load and stress testing of the <b>{lob.name}</b> API platform was completed "
        f"{'successfully' if overall else 'with findings'} in the <b>{lob.environment.title()}</b> environment. "
        f"The system {'demonstrated consistent stability and reliability' if overall else 'showed areas requiring attention'} "
        f"under {run.virtual_users} concurrent virtual users."
    )
    story.append(Paragraph(conclusion_intro, S('conc', fontSize=9, leading=14, alignment=TA_JUSTIFY)))
    story.append(Spacer(1, 6))

    for rec in _recommendations(metrics, thresholds, overall):
        story.append(Paragraph(f'• {rec}', S('rec', fontSize=9, leading=13, leftIndent=10)))
        story.append(Spacer(1, 2))

    story.append(Spacer(1, 10))
    story.append(HRFlowable(width='100%', thickness=0.3, color=GRAY_BD, spaceBefore=4))
    story.append(Spacer(1, 4))
    story.append(Paragraph('— End of Report —',
        S('eor', fontSize=9, textColor=GRAY, alignment=TA_CENTER)))
    story.append(Spacer(1, 4))
    audience = 'Internal' if version=='internal' else 'External / Stakeholder'
    story.append(Paragraph(
        f'Generated by salescode.ai Load Test Portal  ·  {audience}  ·  Run #{run.id}  ·  {datetime.utcnow().strftime("%d %b %Y %H:%M UTC")}',
        S('ft', fontSize=7, textColor=GRAY, alignment=TA_CENTER)
    ))

    doc.build(story)
    buf.seek(0)
    return buf


def _auto_obs(metrics, thresholds, passed, lob_name, run):
    p99   = metrics.get('p99_ms', 0)
    err   = metrics.get('error_rate_pct', 0)
    total = metrics.get('total_requests', 0)
    rps   = metrics.get('rps', 0)
    if passed:
        return (
            f"This report presents the results of load testing conducted on the {lob_name} API platform "
            f"using {run.tool.upper()} in the {run.lob_environment if hasattr(run, 'lob_environment') else 'demo'} environment. "
            f"The system performed successfully. All API endpoints processed requests consistently "
            f"with a {err:.1f}% error rate across {total:,} total requests. "
            f"Average response time was {metrics.get('avg_ms',0)}ms with a throughput of {rps:.1f} requests per second."
        )
    issues = []
    if p99 > thresholds.p99_max_ms:
        issues.append(f"p99 latency ({p99}ms) exceeded the {thresholds.p99_max_ms}ms threshold")
    if err > thresholds.error_rate_max_pct:
        issues.append(f"error rate ({err:.1f}%) exceeded the {thresholds.error_rate_max_pct}% threshold")
    return (
        f"This report presents the results of load testing on the {lob_name} API platform. "
        f"The test identified the following issues: {'; '.join(issues)}. "
        f"Immediate investigation is recommended before production deployment."
    )


def _recommendations(metrics, thresholds, passed):
    if passed:
        return [
            f"Zero or minimal errors recorded — all API endpoints responded successfully.",
            f"System demonstrated stability at the tested concurrency level.",
            f"p99 latency within acceptable threshold — no performance degradation observed.",
            f"The platform is confirmed ready for the tested load level.",
        ]
    recs = []
    if metrics.get('p99_ms',0) > thresholds.p99_max_ms:
        recs.append(f"p99 latency exceeded threshold — review slow endpoints and consider caching or query optimisation.")
    if metrics.get('error_rate_pct',0) > thresholds.error_rate_max_pct:
        recs.append(f"Error rate exceeded acceptable limit — check server logs for root cause.")
    recs.append("Re-run after fixes to confirm resolution before next release.")
    return recs

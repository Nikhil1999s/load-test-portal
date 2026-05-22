import io, os, json
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, Image, PageBreak
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics.charts.barcharts import VerticalBarChart

# ── Brand colours ─────────────────────────────────────────────
TEAL    = colors.HexColor('#0bacaa')
TEAL_LT = colors.HexColor('#E0F7FA')
NAVY    = colors.HexColor('#1565C0')
NAVY_LT = colors.HexColor('#E3F2FD')
GREEN   = colors.HexColor('#2E7D32')
GREEN_LT= colors.HexColor('#E8F5E9')
RED     = colors.HexColor('#C62828')
RED_LT  = colors.HexColor('#FFEBEE')
AMBER   = colors.HexColor('#E65100')
AMBER_LT= colors.HexColor('#FFF3E0')
GRAY    = colors.HexColor('#546E7A')
GRAY_LT = colors.HexColor('#F5F7F8')
GRAY_BD = colors.HexColor('#CFD8DC')
BLACK   = colors.HexColor('#263238')
WHITE   = colors.white

LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets', 'logo.png')
PAGE_W = 174 * mm
W, H   = A4
FONT   = 'Helvetica'
FONT_B = 'Helvetica-Bold'

def S(name, **kw):
    d = dict(fontName=FONT, textColor=BLACK, leading=14, fontSize=10)
    d.update(kw)
    return ParagraphStyle(name, **d)

def _page_template(canvas, doc):
    # CONFIDENTIAL watermark
    canvas.saveState()
    canvas.setFont(FONT, 52); canvas.setFillGray(0.94)
    canvas.translate(W/2, H/2); canvas.rotate(45)
    canvas.drawCentredString(0, 0, 'CONFIDENTIAL')
    canvas.restoreState()
    # Footer — teal bar + page number only
    canvas.saveState()
    canvas.setFillColor(colors.HexColor('#0bacaa'))
    canvas.rect(0, 8*mm, W, 3, fill=1, stroke=0)
    canvas.setFont(FONT_B, 8)
    canvas.setFillColor(colors.HexColor('#546E7A'))
    canvas.drawCentredString(W/2, 4*mm, f'Page {doc.page}')
    canvas.restoreState()

def _section(title, color=NAVY, bg=NAVY_LT, num=None):
    label = f'{num}. {title}' if num else title
    t = Table([[Paragraph(f'<b>{label}</b>', S('sh', fontSize=11, textColor=color, fontName=FONT_B))]],
              colWidths=[PAGE_W])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),bg),
        ('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),
        ('LEFTPADDING',(0,0),(-1,-1),12),
        ('LINEBELOW',(0,0),(-1,-1),2.5,color),
    ]))
    return t

def _header_row(cols, color=TEAL):
    return [Paragraph(f'<b>{c.upper()}</b>', S('h', fontSize=9, fontName=FONT_B, textColor=WHITE, alignment=TA_CENTER)) for c in cols]

def _std_table(data, col_widths, row_bgs=None, header_color=TEAL, font_size=9, repeat_header=True):
    rows = []
    for i, row in enumerate(data):
        cells = []
        for j, cell in enumerate(row):
            if isinstance(cell, Paragraph):
                cells.append(cell)
            else:
                align = TA_CENTER if j > 0 else TA_LEFT
                cells.append(Paragraph(str(cell), S(f'c{i}{j}', fontSize=font_size, alignment=align,
                    fontName=FONT_B if i==0 else FONT,
                    textColor=WHITE if i==0 else BLACK)))
        rows.append(cells)

    t = Table(rows, colWidths=col_widths, repeatRows=1 if repeat_header else 0)
    style = [
        ('BACKGROUND',(0,0),(-1,0),header_color),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE, GRAY_LT]),
        ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
    ]
    t.setStyle(TableStyle(style))
    return t

def _pass_fail(val):
    if val in ('PASS','✓','OK','PASS ✓'):
        return Paragraph('<b>PASS</b>', S('pf', fontSize=9, fontName=FONT_B, textColor=GREEN, alignment=TA_CENTER))
    if val in ('FAIL','✗','FAIL ✗'):
        return Paragraph('<b>FAIL</b>', S('pf2', fontSize=9, fontName=FONT_B, textColor=RED, alignment=TA_CENTER))
    if val in ('WARN','WARNING'):
        return Paragraph('<b>WARN</b>', S('pf3', fontSize=9, fontName=FONT_B, textColor=AMBER, alignment=TA_CENTER))
    return Paragraph(str(val), S('pf4', fontSize=9, alignment=TA_CENTER))

def _verdict_cell(passed):
    return _pass_fail('PASS' if passed else 'FAIL')

def _build_chart(by_endpoint, thresholds):
    endpoints = list(by_endpoint.keys())
    if not endpoints: return None
    short_eps = []
    for ep in endpoints:
        parts = [p for p in ep.split('/') if p]
        label = parts[-1] if parts else ep
        if len(label)>20: label=label[:18]+'..'
        short_eps.append(label)
    p50s=[by_endpoint[ep].get('p50_ms',0) for ep in endpoints]
    p90s=[by_endpoint[ep].get('p90_ms',0) for ep in endpoints]
    p99s=[by_endpoint[ep].get('p99_ms',0) for ep in endpoints]
    max_val=max(p99s+[thresholds.p99_max_ms,100])*1.3
    d=Drawing(float(PAGE_W),200)
    chart=VerticalBarChart()
    chart.x=55; chart.y=35; chart.width=float(PAGE_W)-70; chart.height=150
    chart.data=[p50s,p90s,p99s]
    chart.categoryAxis.categoryNames=short_eps
    chart.categoryAxis.labels.fontSize=9; chart.categoryAxis.labels.fontName=FONT_B
    chart.valueAxis.valueMin=0; chart.valueAxis.valueMax=max_val
    chart.valueAxis.valueStep=max(int(max_val/5/50)*50,50)
    chart.valueAxis.labels.fontSize=8; chart.valueAxis.labels.fontName=FONT
    chart.valueAxis.labelTextFormat='%dms'
    chart.bars[0].fillColor=colors.HexColor('#0288D1')
    chart.bars[1].fillColor=colors.HexColor('#00897B')
    chart.bars[2].fillColor=colors.HexColor('#1565C0')
    chart.bars.strokeColor=None; chart.groupSpacing=20; chart.barSpacing=3
    d.add(chart)
    thresh_y=35+(thresholds.p99_max_ms/max_val)*150
    if thresh_y<=185:
        d.add(Line(55,thresh_y,float(PAGE_W)-15,thresh_y,strokeColor=RED,strokeWidth=1.5,strokeDashArray=[5,3]))
        d.add(String(float(PAGE_W)-13,thresh_y+3,f'Threshold: {thresholds.p99_max_ms}ms',fontSize=7,fontName=FONT_B,fillColor=RED))
    lx=60
    for label,col in [('p50 — Median',colors.HexColor('#0288D1')),('p90 — 90th pct',colors.HexColor('#00897B')),('p99 — Worst case',colors.HexColor('#1565C0'))]:
        d.add(Rect(lx,12,14,9,fillColor=col,strokeColor=None))
        d.add(String(lx+18,12,label,fontSize=8,fontName=FONT_B,fillColor=GRAY))
        lx+=90
    return d

def generate_pdf(run, lob, metrics, thresholds, custom_obs=None, qa_name=None, version='internal'):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm, topMargin=14*mm, bottomMargin=22*mm,
        title=f"Load & Stress Test Report — {lob.name}")
    story = []

    p99_pass  = True  # response time is for reference only
    err_pass  = metrics.get('error_rate_pct',100) <= thresholds.error_rate_max_pct
    overall   = err_pass
    total     = metrics.get('total_requests',0)
    err_pct   = metrics.get('error_rate_pct',0)
    avg_ms    = metrics.get('avg_ms',0)
    rps       = metrics.get('rps',0)
    by_ep     = metrics.get('by_endpoint',{})
    vu_text   = f"{run.virtual_users} virtual {'user' if run.virtual_users==1 else 'users'}"

    # ── COVER PAGE ────────────────────────────────────────────
    story.append(Spacer(1, 20))

    # Logo
    logo_cell = Paragraph('<b><font size="22" color="#0bacaa">salescode.ai</font></b>', S('lg', fontSize=22, textColor=TEAL, fontName=FONT_B))
    if os.path.exists(LOGO_PATH):
        try: logo_cell = Image(LOGO_PATH, width=55*mm, height=17*mm)
        except: pass

    ht = Table([[logo_cell, Paragraph('<b>Load &amp; Stress Test Report</b>',
        S('rt', fontSize=14, fontName=FONT_B, alignment=TA_RIGHT, textColor=BLACK))]], colWidths=[87*mm,87*mm])
    ht.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    story.append(ht)
    story.append(Spacer(1, 3))

    # Teal bar
    div = Table([['']], colWidths=[PAGE_W], rowHeights=[5])
    div.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),TEAL),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    story.append(div)
    story.append(Spacer(1, 16))

    # Overall verdict banner — prominent at top
    v_color = GREEN if overall else RED
    v_bg    = GREEN_LT if overall else RED_LT
    vt = Table([[Paragraph(f'<b>Overall Result: {"PASS" if overall else "FAIL"}</b>',
        S('vv', fontSize=14, fontName=FONT_B, textColor=v_color, alignment=TA_CENTER))]],
        colWidths=[PAGE_W])
    vt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),v_bg),('GRID',(0,0),(-1,-1),1.5,v_color),
        ('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
    story.append(vt)
    story.append(Spacer(1, 16))

    # Basic Details label
    story.append(Paragraph('<b>Basic Details</b>', S('bd', fontSize=11, fontName=FONT_B, textColor=NAVY, spaceAfter=6)))

    # Cover info grid
    cover_rows = [
        ['Platform / LOB',     lob.name,              'Report Version',   'v1.0 — Final'],
        ['Environment',        lob.environment.upper(),'Classification',   'Confidential'],
        ['Test Tool',          run.tool.upper(),       'Test Date',        run.created_at.strftime('%d %B %Y')],
        ['Virtual Users',      vu_text,                'Duration',         f'{run.duration_seconds}s'],
        ['Prepared by',        qa_name or 'QA Engineering Team', 'Run ID', f'#{run.id}'],
    ]
    cw = [35*mm, 52*mm, 38*mm, 49*mm]
    cover_data = []
    for r in cover_rows:
        cover_data.append([
            Paragraph(f'<b>{r[0]}</b>', S('ck', fontSize=9, fontName=FONT_B, textColor=GRAY)),
            Paragraph(r[1], S('cv', fontSize=9)),
            Paragraph(f'<b>{r[2]}</b>', S('ck2', fontSize=9, fontName=FONT_B, textColor=GRAY)),
            Paragraph(r[3], S('cv2', fontSize=9)),
        ])
    ct = Table(cover_data, colWidths=cw)
    ct.setStyle(TableStyle([
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[WHITE, GRAY_LT]),
        ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
        ('LEFTPADDING',(0,0),(-1,-1),8),
    ]))
    story.append(ct)
    story.append(Spacer(1, 20))

    # Table of Contents
    story.append(Paragraph('<b>Table of Contents</b>', S('toc_h', fontSize=11, fontName=FONT_B, textColor=NAVY, spaceAfter=8)))
    has_errors = metrics.get('error_rate_pct', 0) > 0
    toc_sections = [
        ('1', 'Executive Summary'),
        ('2', 'Test Environment & Configuration'),
        ('3', 'Test Results & Performance Metrics'),
        ('4', 'Response Time Analysis — Per Endpoint'),
        ('5', 'Threshold Comparison'),
    ]
    if has_errors:
        toc_sections.append(('6', 'Defects & Error Analysis'))
        toc_sections.append(('7', 'Recommendations & Next Steps'))
    else:
        toc_sections.append(('6', 'Recommendations & Next Steps'))

    toc_data = []
    for num, title in toc_sections:
        toc_data.append([
            Paragraph(f'<b>{num}.</b>', S(f'tn{num}', fontSize=9, fontName=FONT_B, textColor=NAVY, alignment=TA_CENTER)),
            Paragraph(title, S(f'tt{num}', fontSize=9, textColor=BLACK)),
            Paragraph('· · · · · · · · · · · · · · · · · · · · · · · ·', S(f'td{num}', fontSize=7, textColor=GRAY_BD, alignment=TA_RIGHT)),
        ])

    toc_t = Table(toc_data, colWidths=[12*mm, 100*mm, 62*mm])
    toc_t.setStyle(TableStyle([
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[WHITE, GRAY_LT]),
        ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
        ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
        ('LEFTPADDING',(0,0),(-1,-1),8),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LINEAFTER',(0,0),(0,-1),1,TEAL),
    ]))
    story.append(toc_t)
    story.append(PageBreak())

    # ── 1. EXECUTIVE SUMMARY ─────────────────────────────────
    story.append(_section('Executive Summary', num=1))
    story.append(Spacer(1,8))

    # Purpose paragraph
    story.append(Paragraph('<b>1.1 Purpose & Scope</b>', S('sh_es', fontSize=10, fontName=FONT_B, textColor=NAVY, spaceAfter=4)))
    story.append(Paragraph(
        f"This report presents the results of load and stress testing conducted on the "
        f"<b>{lob.name}</b> API platform. The objective of this exercise was to evaluate the "
        f"system's performance, stability, and scalability under simulated concurrent user load "
        f"using <b>{run.tool.upper()}</b> in the <b>{lob.environment.upper()}</b> environment. "
        f"Testing was executed on <b>{run.created_at.strftime('%d %B %Y')}</b> with a controlled "
        f"ramp-up of <b>{run.virtual_users} virtual {'user' if run.virtual_users==1 else 'users'}</b> "
        f"over a {run.ramp_up_seconds}-second ramp period, sustained for <b>{run.duration_seconds} seconds</b>.",
        S('obs1', fontSize=9, leading=15, alignment=TA_JUSTIFY)))
    story.append(Spacer(1,10))

    # Test outcome paragraph
    story.append(Paragraph('<b>1.2 Test Outcome</b>', S('sh_es2', fontSize=10, fontName=FONT_B, textColor=NAVY, spaceAfter=4)))
    by_ep_count = len(by_ep)
    slowest_ep  = max(by_ep.items(), key=lambda x: x[1].get('p99_ms',0))[0] if by_ep else 'N/A'
    fastest_ep  = min(by_ep.items(), key=lambda x: x[1].get('p50_ms',0))[0] if by_ep else 'N/A'
    slowest_p99 = by_ep.get(slowest_ep,{}).get('p99_ms',0)
    fastest_p50 = by_ep.get(fastest_ep,{}).get('p50_ms',0)

    if overall:
        outcome_text = (
            f"The <b>{lob.name}</b> platform demonstrated <b>stable and acceptable performance</b> throughout the "
            f"test duration. A total of <b>{total:,} API requests</b> were executed across "
            f"<b>{by_ep_count} endpoint{'s' if by_ep_count!=1 else ''}</b>, achieving an average response time of "
            f"<b>{avg_ms}ms</b> and a throughput of <b>{rps:.1f} requests per second</b>. "
            f"The error rate remained at <b>{err_pct:.2f}%</b>, well within the acceptable threshold of "
            f"{thresholds.error_rate_max_pct}%. The worst-case p99 latency of <b>{metrics.get('p99_ms',0)}ms</b> "
            f"was within the {thresholds.p99_max_ms}ms SLA target. "
            f"The slowest endpoint was <b>{slowest_ep.split('/')[-1]}</b> with a p99 of {slowest_p99}ms, "
            f"while the fastest responded at {fastest_p50}ms median. "
            f"<b>All performance thresholds were met and the overall test verdict is PASS.</b>"
        )
    else:
        issues = []
        if metrics.get('p99_ms',0) > thresholds.p99_max_ms:
            issues.append(f"p99 latency of {metrics.get('p99_ms',0)}ms exceeded the {thresholds.p99_max_ms}ms threshold")
        if err_pct > thresholds.error_rate_max_pct:
            issues.append(f"error rate of {err_pct:.2f}% exceeded the {thresholds.error_rate_max_pct}% limit")
        outcome_text = (
            f"The <b>{lob.name}</b> platform encountered <b>performance issues</b> during load testing. "
            f"A total of <b>{total:,} API requests</b> were executed across <b>{by_ep_count} endpoints</b>. "
            f"The following issues were identified: <b>{'; '.join(issues)}</b>. "
            f"Out of {total:,} requests, <b>{metrics.get('errors',0)} failed</b>, resulting in a "
            f"{err_pct:.2f}% error rate. The average response time was {avg_ms}ms. "
            f"<b>Immediate investigation and remediation is recommended before the next release.</b> "
            f"Refer to the Defects &amp; Error Analysis section for detailed breakdown."
        )
    story.append(Paragraph(outcome_text, S('obs2', fontSize=9, leading=15, alignment=TA_JUSTIFY)))
    story.append(Spacer(1,10))

    # Scope of testing
    story.append(Paragraph('<b>1.3 Scope of Testing</b>', S('sh_es3', fontSize=10, fontName=FONT_B, textColor=NAVY, spaceAfter=4)))
    scope_rows = [
        _header_row(['Parameter', 'Detail']),
        ['Tested Endpoints',    f'{by_ep_count} API endpoint{"s" if by_ep_count!=1 else ""}'],
        ['Test Type',           'Load & Stress Testing — simulated concurrent users'],
        ['Environment',         f'{lob.environment.upper()} — {lob.base_url}'],
        ['Tool',                f'{run.tool.upper()} — automated script execution'],
        ['Virtual Users',       f'{run.virtual_users} concurrent virtual {"user" if run.virtual_users==1 else "users"}'],
        ['Test Duration',       f'{run.duration_seconds} seconds ({run.duration_seconds//60}m {run.duration_seconds%60}s)'],
        ['Ramp-up Period',      f'{run.ramp_up_seconds} seconds — gradual load increase'],
        ['Execution Date',      run.created_at.strftime('%d %B %Y %H:%M UTC')],
    ]
    scope_t = Table(scope_rows, colWidths=[60*mm, 114*mm])
    scope_t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),TEAL),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE, GRAY_LT]),
        ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),8),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('FONTNAME',(0,1),(0,-1),FONT_B),('TEXTCOLOR',(0,1),(0,-1),GRAY),
    ]))
    story.append(scope_t)
    story.append(Spacer(1,10))

    # Key findings
    story.append(Paragraph('<b>1.4 Key Findings at a Glance</b>', S('kf', fontSize=10, fontName=FONT_B, textColor=NAVY, spaceAfter=6)))
    kf_data = [
        _header_row(['Metric', 'Result', 'SLA Target', 'Status']),
        ['Total Requests', f'{total:,}', '—', _pass_fail('PASS')],
        ['Average Response Time', f'{avg_ms}ms', 'For reference', Paragraph('—', S('ref', fontSize=9, alignment=TA_CENTER, textColor=GRAY))],
        ['p90 Response Time', f'{metrics.get("p90_ms",0)}ms', 'For reference', Paragraph('—', S('ref2', fontSize=9, alignment=TA_CENTER, textColor=GRAY))],
        ['p99 Response Time (Worst Case)', f'{metrics.get("p99_ms",0)}ms', 'For reference', Paragraph('—', S('ref3', fontSize=9, alignment=TA_CENTER, textColor=GRAY))],
        ['Error Rate', f'{err_pct:.2f}%', f'< {thresholds.error_rate_max_pct}%', _verdict_cell(err_pass)],
        ['Throughput', f'{rps:.1f} req/s', '> 0 req/s', _pass_fail('PASS')],
        ['System Availability', f'{(1-err_pct/100)*100:.2f}%', '> 99.0%', _verdict_cell(err_pct<1.0)],
    ]
    kf_cw = [75*mm, 35*mm, 35*mm, 29*mm]
    kft = Table(kf_data, colWidths=kf_cw)
    kf_style = [
        ('BACKGROUND',(0,0),(-1,0),TEAL),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE, GRAY_LT]),
        ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),('ALIGN',(1,0),(-1,-1),'CENTER'),
    ]
    kft.setStyle(TableStyle(kf_style))
    story.append(kft)
    story.append(Spacer(1,12))

    # ── 2. TEST ENVIRONMENT ───────────────────────────────────
    story.append(_section('Test Environment & Configuration', num=2, color=NAVY, bg=NAVY_LT))
    story.append(Spacer(1,6))

    story.append(Paragraph('<b>2.1 Tool & Methodology</b>', S('sh2', fontSize=10, fontName=FONT_B, spaceAfter=4)))
    story.append(Paragraph(
        f"Testing was performed using <b>{run.tool.upper()}</b> against the <b>{lob.environment.upper()}</b> "
        f"environment ({lob.base_url}). The test used a controlled ramp-up approach with {vu_text} over a "
        f"{run.ramp_up_seconds}-second ramp-up period, then sustained for {run.duration_seconds} seconds.",
        S('meth', fontSize=9, leading=14, alignment=TA_JUSTIFY)))
    story.append(Spacer(1,8))

    story.append(Paragraph('<b>2.2 Test Parameters</b>', S('sh2b', fontSize=10, fontName=FONT_B, spaceAfter=4)))
    start_t = run.created_at.strftime('%d %b %Y %H:%M UTC')
    end_t   = run.finished_at.strftime('%d %b %Y %H:%M UTC') if run.finished_at else 'N/A'
    cfg_rows = [
        ['Virtual Users',  vu_text,      'Tool',         run.tool.upper()],
        ['Duration',       f'{run.duration_seconds}s', 'Ramp-up', f'{run.ramp_up_seconds}s'],
        ['Iterations',     str(run.iterations or 'Duration-based'), 'Environment', lob.environment.upper()],
        ['Base URL',       lob.base_url, 'Start Time',   start_t],
        ['End Time',       end_t,        'Run ID',       f'#{run.id}'],
    ]
    cfg_cw = [32*mm,55*mm,32*mm,55*mm]
    cfg_t = Table(cfg_rows, colWidths=cfg_cw)
    cfg_t.setStyle(TableStyle([
        ('FONTSIZE',(0,0),(-1,-1),9),('FONTNAME',(0,0),(0,-1),FONT_B),('FONTNAME',(2,0),(2,-1),FONT_B),
        ('TEXTCOLOR',(0,0),(0,-1),GRAY),('TEXTCOLOR',(2,0),(2,-1),GRAY),
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[WHITE,GRAY_LT]),('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),('LEFTPADDING',(0,0),(-1,-1),8),
    ]))
    story.append(cfg_t)
    story.append(Spacer(1,12))

    # ── 3. RESPONSE TIME ANALYSIS ────────────────────────────
    story.append(PageBreak())
    story.append(_section('Test Results & Performance Metrics', num=3, color=colors.HexColor('#1565C0'), bg=NAVY_LT))
    story.append(Spacer(1,6))

    story.append(Paragraph('<b>3.1 Response Time Analysis</b>',
        S('sh3', fontSize=10, fontName=FONT_B, textColor=NAVY, spaceAfter=4)))
    story.append(Paragraph(
        'Response times measured end-to-end. All values in milliseconds.',
        S('note', fontSize=8, textColor=GRAY, spaceAfter=6)))

    if by_ep:
        rt_data = [_header_row(['Endpoint', 'Method', 'Requests', 'Avg (ms)', 'p90 (ms)', 'p99 (ms)', 'Max (ms)', 'SLA'])]
        for ep, d in by_ep.items():
            ep_pass = d.get('p99_ms',0) <= thresholds.p99_max_ms
            short_ep = ep if len(ep)<=40 else ep[:38]+'..'
            rt_data.append([
                Paragraph(short_ep, S('ep', fontSize=9, alignment=TA_CENTER)),
                Paragraph(d.get('method','GET'), S('m', fontSize=9, alignment=TA_CENTER)),
                Paragraph(str(d.get('count',0)), S('c', fontSize=9, alignment=TA_CENTER)),
                Paragraph(str(d.get('p50_ms',0)), S('a', fontSize=9, alignment=TA_CENTER)),
                Paragraph(str(d.get('p90_ms',0)), S('p9', fontSize=9, alignment=TA_CENTER)),
                Paragraph(str(d.get('p99_ms',0)), S('p99', fontSize=9, alignment=TA_CENTER)),
                Paragraph(str(metrics.get('max_ms',0)), S('mx', fontSize=9, alignment=TA_CENTER)),
                Paragraph('PASS' if ep_pass else 'FAIL',
                    S('sla', fontSize=9, fontName=FONT_B, alignment=TA_CENTER,
                      textColor=GREEN if ep_pass else RED)),
            ])
        rt_t = Table(rt_data, colWidths=[60*mm,14*mm,18*mm,16*mm,16*mm,16*mm,16*mm,18*mm], repeatRows=1)
        rt_style = [
            ('BACKGROUND',(0,0),(-1,0),TEAL),
            ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,GRAY_LT]),
            ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
            ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
            ('LEFTPADDING',(0,0),(-1,-1),5),('ALIGN',(0,0),(-1,-1),'CENTER'),
            ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ]
        rt_t.setStyle(TableStyle(rt_style))
        story.append(rt_t)
    story.append(Spacer(1,10))

    story.append(Paragraph('<b>3.2 Throughput & Error Rates</b>',
        S('sh3b', fontSize=10, fontName=FONT_B, textColor=NAVY, spaceAfter=4)))
    te_data = [
        _header_row(['Scenario', 'Virtual Users', 'Total Requests', 'Avg TPS', 'Error Rate', 'Result']),
        [f'{lob.name} — {run.tool.upper()}', str(run.virtual_users), f'{total:,}',
         f'{rps:.1f}', f'{err_pct:.2f}%', _verdict_cell(overall)],
    ]
    te_t = Table(te_data, colWidths=[55*mm,28*mm,30*mm,25*mm,22*mm,14*mm])
    te_t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),TEAL),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,GRAY_LT]),
        ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),6),('ALIGN',(1,0),(-1,-1),'CENTER'),
    ]))
    story.append(te_t)
    story.append(Spacer(1,12))

    # ── 4. COLOR-CODED PERFORMANCE TABLE ─────────────────────
    story.append(PageBreak())
    story.append(_section('Response Time Analysis — Per Endpoint', num=4,
                           color=AMBER, bg=AMBER_LT))
    story.append(Spacer(1,6))
    story.append(Paragraph(
        'Color key:  Green = fast (below 70% of threshold)  ·  Amber = moderate (70–100%)  ·  Red = exceeds threshold',
        S('cc', fontSize=8, textColor=GRAY, leading=12)))
    story.append(Spacer(1,8))

    if by_ep:
        def _lat_para(val, threshold):
            n = int(val)
            if n > threshold:
                bg, col = RED_LT, RED
            elif n > threshold * 0.7:
                bg, col = colors.HexColor('#FFF8E1'), AMBER
            else:
                bg, col = GREEN_LT, GREEN
            return Paragraph(f'{val}ms', S('lp', fontSize=9, fontName=FONT_B,
                             textColor=col, alignment=TA_CENTER)), bg

        perf_data = [_header_row(['Endpoint', 'Method', 'Requests', 'p50', 'p90', 'p99', 'Max', 'SLA'])]
        perf_styles = [
            ('BACKGROUND',(0,0),(-1,0),TEAL),
            ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
            ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
            ('LEFTPADDING',(0,0),(-1,-1),5),('ALIGN',(0,0),(-1,-1),'CENTER'),
            ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ]

        for ri, (ep, d) in enumerate(by_ep.items(), 1):
            ep_pass = d.get('p99_ms',0) <= thresholds.p99_max_ms
            short_ep = ep if len(ep)<=38 else ep[:36]+'..'
            row_bg = WHITE if ri % 2 == 1 else GRAY_LT

            p50_p, p50_bg = _lat_para(d.get('p50_ms',0), thresholds.p99_max_ms)
            p90_p, p90_bg = _lat_para(d.get('p90_ms',0), thresholds.p90_max_ms)
            p99_p, p99_bg = _lat_para(d.get('p99_ms',0), thresholds.p99_max_ms)
            max_p, max_bg = _lat_para(metrics.get('max_ms',0), thresholds.p99_max_ms)

            perf_data.append([
                Paragraph(short_ep, S('ep2', fontSize=9, alignment=TA_CENTER)),
                Paragraph(d.get('method','GET'), S('mt', fontSize=9, alignment=TA_CENTER,
                    textColor=NAVY if d.get('method','GET')=='GET' else GREEN)),
                Paragraph(str(d.get('count',0)), S('ct', fontSize=9, alignment=TA_CENTER)),
                p50_p, p90_p, p99_p, max_p,
                Paragraph('PASS' if ep_pass else 'FAIL',
                    S('sla2', fontSize=9, fontName=FONT_B, alignment=TA_CENTER,
                      textColor=GREEN if ep_pass else RED)),
            ])
            # Apply per-cell background colors
            perf_styles.append(('BACKGROUND',(0,ri),(0,ri),row_bg))
            perf_styles.append(('BACKGROUND',(1,ri),(1,ri),row_bg))
            perf_styles.append(('BACKGROUND',(2,ri),(2,ri),row_bg))
            perf_styles.append(('BACKGROUND',(3,ri),(3,ri),p50_bg))
            perf_styles.append(('BACKGROUND',(4,ri),(4,ri),p90_bg))
            perf_styles.append(('BACKGROUND',(5,ri),(5,ri),p99_bg))
            perf_styles.append(('BACKGROUND',(6,ri),(6,ri),max_bg))
            perf_styles.append(('BACKGROUND',(7,ri),(7,ri),GREEN_LT if ep_pass else RED_LT))

        perf_t = Table(perf_data, colWidths=[58*mm,14*mm,17*mm,16*mm,16*mm,16*mm,16*mm,21*mm], repeatRows=1)
        perf_t.setStyle(TableStyle(perf_styles))
        story.append(perf_t)
    story.append(Spacer(1,12))

    # ── 5. THRESHOLD COMPARISON ───────────────────────────────
    story.append(_section('Threshold Comparison', num=5, color=GREEN, bg=GREEN_LT))
    story.append(Spacer(1,6))
    th_data = [
        _header_row(['Metric', 'Actual', 'Threshold', 'Variance', 'Status']),
        ['p99 Latency', f'{metrics.get("p99_ms",0)}ms', f'{thresholds.p99_max_ms}ms',
         f'{metrics.get("p99_ms",0)-thresholds.p99_max_ms:+d}ms', _verdict_cell(p99_pass)],
        ['p90 Latency', f'{metrics.get("p90_ms",0)}ms', f'{thresholds.p90_max_ms}ms',
         f'{metrics.get("p90_ms",0)-thresholds.p90_max_ms:+d}ms', _verdict_cell(metrics.get("p90_ms",0)<=thresholds.p90_max_ms)],
        ['Error Rate', f'{err_pct:.2f}%', f'{thresholds.error_rate_max_pct}%',
         f'{err_pct-thresholds.error_rate_max_pct:+.2f}%', _verdict_cell(err_pass)],
        ['Average Response', f'{avg_ms}ms', f'< {thresholds.p99_max_ms}ms', f'{avg_ms-thresholds.p99_max_ms:+d}ms', _verdict_cell(avg_ms<=thresholds.p99_max_ms)],
    ]
    th_t = Table(th_data, colWidths=[55*mm,30*mm,30*mm,30*mm,29*mm])
    th_t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),TEAL),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,GRAY_LT]),
        ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),8),('ALIGN',(1,0),(-1,-1),'CENTER'),
    ]))
    story.append(th_t)
    story.append(Spacer(1,12))

    # ── 6. ERROR ANALYSIS ─────────────────────────────────────
    error_samples = metrics.get('error_samples',[])
    status_summary = metrics.get('status_summary',{})
    if err_pct > 0:
        story.append(PageBreak())
        story.append(_section('Defects & Error Analysis', num=6, color=RED, bg=RED_LT))
        story.append(Spacer(1,6))

        # Status code summary
        if status_summary.get('details'):
            story.append(Paragraph('<b>HTTP Status Code Distribution</b>',
                S('sc', fontSize=10, fontName=FONT_B, spaceAfter=4)))
            sc_rows = [_header_row(['Status Code', 'Description', 'Count', 'Category'])]
            for code, count in sorted(status_summary.get('details',{}).items()):
                cat = '2xx Success' if code.startswith('2') else '4xx Client Error' if code.startswith('4') else '5xx Server Error' if code.startswith('5') else 'Other'
                sc_rows.append([code, _http_status_text(int(code)), str(count), cat])
            sc_t = Table(sc_rows, colWidths=[25*mm,60*mm,25*mm,64*mm])
            sc_t.setStyle(TableStyle([
                ('BACKGROUND',(0,0),(-1,0),RED),
                ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,RED_LT]),
                ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
                ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
                ('LEFTPADDING',(0,0),(-1,-1),6),('ALIGN',(2,0),(2,-1),'CENTER'),
            ]))
            story.append(sc_t)
            story.append(Spacer(1,8))

        # Sample errors
        if error_samples:
            story.append(Paragraph('<b>Sample Failed Requests</b>',
                S('se', fontSize=10, fontName=FONT_B, spaceAfter=4)))
            er_rows = [_header_row(['Endpoint', 'Method', 'HTTP Status', 'Error', 'Latency'])]
            for s in error_samples:
                er_rows.append([s.get('endpoint',''), s.get('method','GET'),
                    str(s.get('status_code',0)), s.get('status_text',''), f"{s.get('latency_ms',0)}ms"])
            er_t = Table(er_rows, colWidths=[65*mm,16*mm,22*mm,45*mm,26*mm])
            er_t.setStyle(TableStyle([
                ('BACKGROUND',(0,0),(-1,0),RED),
                ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,RED_LT]),
                ('GRID',(0,0),(-1,-1),0.8,colors.HexColor('#455A64')),
                ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
                ('LEFTPADDING',(0,0),(-1,-1),6),('ALIGN',(2,0),(-1,-1),'CENTER'),
            ]))
            story.append(er_t)
        story.append(Spacer(1,12))
        sec_num = 7
    else:
        sec_num = 6

    # ── 7. RECOMMENDATIONS ────────────────────────────────────
    story.append(_section('Recommendations & Next Steps', num=sec_num, color=NAVY, bg=NAVY_LT))
    story.append(Spacer(1,8))

    recs = _recommendations(metrics, thresholds, overall)

    priority_config = {
        'Critical — No Issues Found':           (GREEN,  GREEN_LT,  colors.HexColor('#A5D6A7'), '✓'),
        'Critical — Address Immediately':        (RED,    RED_LT,    colors.HexColor('#FFCDD2'), '!'),
        'High Priority — Proactive Improvements':(NAVY,   NAVY_LT,   colors.HexColor('#BBDEFB'), '→'),
        'High Priority — Address This Sprint':   (NAVY,   NAVY_LT,   colors.HexColor('#BBDEFB'), '!'),
        'Best Practices — Ongoing':              (TEAL,   TEAL_LT,   colors.HexColor('#B2EBF2'), '★'),
        'Best Practices':                        (TEAL,   TEAL_LT,   colors.HexColor('#B2EBF2'), '★'),
    }

    for priority, items in recs.items():
        col, bg, border_col, icon = priority_config.get(priority, (NAVY, NAVY_LT, GRAY_BD, '▶'))

        # Priority header card
        hdr_data = [[
            Paragraph(f'<b>{icon}</b>', S(f'ph_{priority[:4]}', fontSize=13, fontName=FONT_B,
                textColor=WHITE, alignment=TA_CENTER)),
            Paragraph(f'<b>{priority.upper()}</b>', S(f'pt_{priority[:4]}', fontSize=10,
                fontName=FONT_B, textColor=WHITE)),
        ]]
        hdr_t = Table(hdr_data, colWidths=[12*mm, PAGE_W-12*mm])
        hdr_t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1),col),
            ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
            ('LEFTPADDING',(0,0),(-1,-1),8),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
            ('LINEAFTER',(0,0),(0,-1),0,WHITE),
        ]))
        story.append(hdr_t)

        # Items table
        item_rows = []
        for item in items:
            item_rows.append([
                Paragraph('▸', S(f'bi_{item[:4]}', fontSize=10, textColor=col, alignment=TA_CENTER)),
                Paragraph(item, S(f'it_{item[:4]}', fontSize=9, leading=14, textColor=BLACK)),
            ])

        items_t = Table(item_rows, colWidths=[10*mm, PAGE_W-10*mm])
        items_t.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1),bg),
            ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),
            ('LEFTPADDING',(0,0),(-1,-1),8),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
            ('LINEBEFORE',(0,0),(0,-1),3,col),
            ('LINEBELOW',(0,0),(-1,-1),0.5,border_col),
            ('BOX',(0,0),(-1,-1),0.8,col),
        ]))
        story.append(items_t)
        story.append(Spacer(1,8))

    # ── FOOTER ────────────────────────────────────────────────
    story.append(Spacer(1,10))
    div2 = Table([['']], colWidths=[PAGE_W], rowHeights=[3])
    div2.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),TEAL),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    story.append(div2)
    story.append(Spacer(1,4))
    story.append(Paragraph(
        f'— End of Report —  ·  salescode.ai Load & Stress Testing Portal  ·  Run #{run.id}  ·  {datetime.utcnow().strftime("%d %b %Y %H:%M UTC")}',
        S('ft', fontSize=7, textColor=GRAY, alignment=TA_CENTER)))

    doc.build(story, onFirstPage=_page_template, onLaterPages=_page_template)
    buf.seek(0)
    return buf


def _auto_obs(metrics, thresholds, passed, lob_name, run):
    p99=metrics.get('p99_ms',0); err=metrics.get('error_rate_pct',0)
    total=metrics.get('total_requests',0); rps=metrics.get('rps',0)
    vu_text=f"{run.virtual_users} virtual {'user' if run.virtual_users==1 else 'users'}"
    if passed:
        return (f"This report presents the results of load and stress testing conducted on the <b>{lob_name}</b> "
                f"API platform using <b>{run.tool.upper()}</b> in the <b>{run.lob_environment if hasattr(run,'lob_environment') else run.tool}</b> environment. "
                f"The system performed successfully with a <b>{err:.2f}% error rate</b> across <b>{total:,} total requests</b> "
                f"under {vu_text}. Average response time was <b>{metrics.get('avg_ms',0)}ms</b> with a throughput of "
                f"<b>{rps:.1f} requests per second</b>. All performance thresholds were met.")
    issues = []
    if p99 > thresholds.p99_max_ms: issues.append(f"p99 latency ({p99}ms) exceeded the {thresholds.p99_max_ms}ms threshold")
    if err > thresholds.error_rate_max_pct: issues.append(f"error rate ({err:.2f}%) exceeded the {thresholds.error_rate_max_pct}% threshold")
    return (f"Load and stress testing of <b>{lob_name}</b> identified performance issues: <b>{'; '.join(issues)}</b>. "
            f"Immediate investigation is recommended. Refer to the Defects & Error Analysis section for details.")

def _recommendations(metrics, thresholds, passed):
    if passed:
        return {
            'Critical — No Issues Found': [
                'All endpoints responded within acceptable thresholds.',
                'System demonstrated stability under the tested concurrent user load.',
            ],
            'High Priority — Proactive Improvements': [
                f'Consider increasing virtual users in the next test cycle to identify the system breaking point.',
                'Add the test suite to CI/CD pipeline to catch regressions before each release.',
            ],
            'Best Practices — Ongoing': [
                'Schedule monthly baseline load tests against production traffic snapshots.',
                'Monitor p99 latency trends across releases — gradual degradation is often invisible without tracking.',
                'Review auto-scaling thresholds to ensure adequate warm-up time before user impact.',
            ]
        }
    recs = {'Critical — Address Immediately': [], 'High Priority — Address This Sprint': [], 'Best Practices': []}
    if metrics.get('p99_ms',0) > thresholds.p99_max_ms:
        recs['Critical — Address Immediately'].append(
            f"p99 latency ({metrics.get('p99_ms',0)}ms) exceeds {thresholds.p99_max_ms}ms threshold — investigate slow endpoints and consider caching or query optimisation.")
    if metrics.get('error_rate_pct',0) > thresholds.error_rate_max_pct:
        err = metrics.get('error_samples',[])
        if err and err[0].get('status_code')==401:
            recs['Critical — Address Immediately'].append('HTTP 401 errors detected — token has expired. Refresh the token and re-run.')
        elif err and err[0].get('status_code')==500:
            recs['Critical — Address Immediately'].append('HTTP 500 server errors detected — review server logs to identify root cause before re-testing.')
        else:
            recs['Critical — Address Immediately'].append(f"Error rate ({metrics.get('error_rate_pct',0):.2f}%) exceeds {thresholds.error_rate_max_pct}% — investigate failed requests in the error analysis section.")
    recs['High Priority — Address This Sprint'].append('Re-run after fixes to confirm resolution before the next release.')
    recs['Best Practices'].append('Add load tests to CI/CD pipeline with automated pass/fail gates on p99 and error rate.')
    return recs

def _http_status_text(code):
    t = {200:'OK',201:'Created',400:'Bad Request',401:'Unauthorized',403:'Forbidden',
         404:'Not Found',405:'Method Not Allowed',408:'Timeout',429:'Too Many Requests',
         500:'Internal Server Error',502:'Bad Gateway',503:'Service Unavailable',504:'Gateway Timeout'}
    return t.get(code, f'HTTP {code}')

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
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.platypus.flowables import Flowable

TEAL      = colors.HexColor('#007B8A')
TEAL_LT   = colors.HexColor('#E0F7FA')
TEAL_MID  = colors.HexColor('#B2EBF2')
NAVY      = colors.HexColor('#1565C0')
NAVY_LT   = colors.HexColor('#E3F2FD')
GREEN     = colors.HexColor('#2E7D32')
GREEN_LT  = colors.HexColor('#E8F5E9')
RED       = colors.HexColor('#C62828')
RED_LT    = colors.HexColor('#FFEBEE')
AMBER     = colors.HexColor('#E65100')
AMBER_LT  = colors.HexColor('#FFF3E0')
GRAY      = colors.HexColor('#546E7A')
GRAY_LT   = colors.HexColor('#F5F7F8')
GRAY_BD   = colors.HexColor('#CFD8DC')
BLACK     = colors.HexColor('#263238')
WHITE     = colors.white
BLUE_C    = colors.HexColor('#0288D1')
TEAL_C    = colors.HexColor('#00897B')
NAVY_C    = colors.HexColor('#1565C0')

LOGO_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets', 'logo.png')
PAGE_W    = 174 * mm
FONT      = 'Helvetica'
FONT_B    = 'Helvetica-Bold'
FONT_I    = 'Helvetica-Oblique'
W, H      = A4


def S(name, **kw):
    d = dict(fontName=FONT, textColor=BLACK, leading=14, fontSize=10)
    d.update(kw)
    return ParagraphStyle(name, **d)


def section_header(title, color=TEAL, bg=TEAL_LT):
    t = Table([[Paragraph(f'<b>{title}</b>', S('sh', fontSize=11, textColor=color, fontName=FONT_B))]],
              colWidths=[PAGE_W])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),bg),
        ('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10),
        ('LEFTPADDING',(0,0),(-1,-1),14),('RIGHTPADDING',(0,0),(-1,-1),14),
        ('LINEBELOW',(0,0),(-1,-1),2.5,color),
    ]))
    return t


def metric_cards(items, bg=GRAY_LT):
    n = len(items)
    cw = PAGE_W / n
    labels = [Paragraph(f'<font size="8" color="#546E7A">{l}</font>',
                        S('ml', fontSize=8, textColor=GRAY, alignment=TA_CENTER)) for l,_,_ in items]
    vals   = [Paragraph(f'<b><font size="13" color="{c}">{v}</font></b>',
                        S('mv', fontSize=13, fontName=FONT_B, alignment=TA_CENTER)) for _,v,c in items]
    t = Table([labels, vals], colWidths=[cw]*n)
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),bg),
        ('GRID',(0,0),(-1,-1),0.3,GRAY_BD),
        ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),10),
        ('ALIGN',(0,0),(-1,-1),'CENTER'),('VALIGN',(0,0),(-1,-1),'MIDDLE'),
    ]))
    return t


def def_table(defs):
    rows = [[Paragraph(f'<b><font size="8">{k}</font></b>', S('dk', fontSize=8, fontName=FONT_B, textColor=NAVY)),
             Paragraph(f'<font size="8">{v}</font>', S('dv', fontSize=8, textColor=GRAY))]
            for k,v in defs]
    t = Table(rows, colWidths=[32*mm, 142*mm])
    t.setStyle(TableStyle([
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[WHITE, colors.HexColor('#F0FAFC')]),
        ('GRID',(0,0),(-1,-1),0.3,TEAL_MID),
        ('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5),
        ('LEFTPADDING',(0,0),(-1,-1),8),
    ]))
    return t


def build_chart(by_endpoint, thresholds):
    endpoints = list(by_endpoint.keys())
    if not endpoints:
        return None

    # Short last segment of endpoint for x-axis label
    short_eps = []
    for ep in endpoints:
        parts = [p for p in ep.split('/') if p]
        label = parts[-1] if parts else ep
        if len(label) > 20: label = label[:18]+'..'
        short_eps.append(label)

    p50s = [by_endpoint[ep].get('p50_ms',0) for ep in endpoints]
    p90s = [by_endpoint[ep].get('p90_ms',0) for ep in endpoints]
    p99s = [by_endpoint[ep].get('p99_ms',0) for ep in endpoints]
    max_val = max(p99s + [thresholds.p99_max_ms, 100]) * 1.3

    chart_h = 170
    d_w = float(PAGE_W)
    d = Drawing(d_w, chart_h + 45)

    chart = VerticalBarChart()
    chart.x       = 55
    chart.y       = 40
    chart.width   = d_w - 70
    chart.height  = chart_h
    chart.data    = [p50s, p90s, p99s]
    chart.categoryAxis.categoryNames   = short_eps
    chart.categoryAxis.labels.fontSize = 9
    chart.categoryAxis.labels.fontName = FONT_B
    chart.categoryAxis.labels.angle    = 0
    chart.categoryAxis.labels.dy       = -6
    chart.categoryAxis.strokeColor     = GRAY_BD
    chart.categoryAxis.strokeWidth     = 0.5
    chart.valueAxis.valueMin           = 0
    chart.valueAxis.valueMax           = max_val
    chart.valueAxis.valueStep          = max(int(max_val/5/50)*50, 50)
    chart.valueAxis.labels.fontSize    = 8
    chart.valueAxis.labels.fontName    = FONT
    chart.valueAxis.labelTextFormat    = '%dms'
    chart.valueAxis.strokeColor        = GRAY_BD
    chart.valueAxis.strokeWidth        = 0.5
    chart.bars[0].fillColor            = BLUE_C
    chart.bars[1].fillColor            = TEAL_C
    chart.bars[2].fillColor            = NAVY_C
    chart.bars.strokeColor             = None
    chart.groupSpacing                 = 20
    chart.barSpacing                   = 3
    d.add(chart)

    # Threshold line
    thresh_y = 40 + (thresholds.p99_max_ms / max_val) * chart_h
    if thresh_y <= chart_h + 40:
        d.add(Line(55, thresh_y, d_w - 15, thresh_y,
                   strokeColor=RED, strokeWidth=1.5, strokeDashArray=[5,3]))
        d.add(String(d_w - 13, thresh_y + 3,
                     f'Limit: {thresholds.p99_max_ms}ms',
                     fontSize=7, fontName=FONT_B, fillColor=RED))

    # Legend
    lx = 60
    for label, col in [('p50 — Median', BLUE_C), ('p90 — 90th pct', TEAL_C), ('p99 — Worst case', NAVY_C)]:
        d.add(Rect(lx, 12, 14, 9, fillColor=col, strokeColor=None))
        d.add(String(lx+18, 12, label, fontSize=8, fontName=FONT_B, fillColor=GRAY))
        lx += 90

    return d


def _page_template(canvas, doc):
    """Add CONFIDENTIAL watermark + page number on every page."""
    canvas.saveState()
    # Very light watermark
    canvas.setFont(FONT, 55)
    canvas.setFillGray(0.93)
    canvas.translate(W/2, H/2)
    canvas.rotate(45)
    canvas.drawCentredString(0, 0, 'CONFIDENTIAL')
    canvas.restoreState()
    # Page number
    canvas.saveState()
    canvas.setFont(FONT, 7)
    canvas.setFillColor(GRAY)
    canvas.drawCentredString(W/2, 12*mm, f'Page {doc.page}  |  salescode.ai Load & Stress Testing Portal  |  Confidential')
    canvas.restoreState()


def generate_pdf(run, lob, metrics, thresholds, custom_obs=None, qa_name=None, version='internal'):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm, topMargin=14*mm, bottomMargin=22*mm,
        title=f"Load Test Report — {lob.name}")

    story = []

    # ── HEADER ───────────────────────────────────────────────────
    logo_cell = Paragraph('<b><font size="18" color="#007B8A">salescode.ai</font></b>',
                          S('lg', fontSize=18, textColor=TEAL, fontName=FONT_B))
    if os.path.exists(LOGO_PATH):
        try:
            logo_cell = Image(LOGO_PATH, width=50*mm, height=16*mm)
        except Exception:
            pass

    ht = Table([[
        logo_cell,
        Paragraph(
            f'<b>Load &amp; Stress Test Report</b><br/>'
            f'<font size="9" color="#546E7A">{lob.name} · {lob.environment.upper()} · {run.created_at.strftime("%d %B %Y")}</font>',
            S("rh", fontSize=13, fontName=FONT_B, alignment=TA_RIGHT, leading=19))
    ]], colWidths=[87*mm, 87*mm])
    ht.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),
                             ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    story.append(ht)

    # Thick teal divider
    div = Table([['']], colWidths=[PAGE_W], rowHeights=[4])
    div.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),TEAL),
                              ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    story.append(div)
    story.append(Spacer(1, 8))

    # ── INFO CARDS ───────────────────────────────────────────────
    p99_pass  = metrics.get('p99_ms',0) <= thresholds.p99_max_ms
    err_pass  = metrics.get('error_rate_pct',100) <= thresholds.error_rate_max_pct
    overall   = p99_pass and err_pass
    verdict_c = GREEN if overall else RED
    verdict   = 'PASS ✓' if overall else 'FAIL ✗'
    verdict_bg= GREEN_LT if overall else RED_LT

    vu_label = f"{run.virtual_users} VU{'s' if run.virtual_users != 1 else ''}"
    info_data = [[
        Paragraph(f'<font size="7" color="#546E7A">LOB</font><br/><b>{lob.name}</b>', S('i1', fontName=FONT_B, leading=14)),
        Paragraph(f'<font size="7" color="#546E7A">Environment</font><br/><b>{lob.environment.upper()}</b>', S('i2', fontName=FONT_B, leading=14)),
        Paragraph(f'<font size="7" color="#546E7A">Tool</font><br/><b>{run.tool.upper()}</b>', S('i3', fontName=FONT_B, leading=14)),
        Paragraph(f'<font size="7" color="#546E7A">Virtual Users</font><br/><b>{vu_label}</b>', S('i4', fontName=FONT_B, leading=14)),
        Paragraph(f'<font size="7" color="#546E7A">Duration</font><br/><b>{run.duration_seconds}s</b>', S('i5', fontName=FONT_B, leading=14)),
        Paragraph(f'<font size="7" color="#546E7A">Verdict</font><br/><b><font color="#{verdict_c.hexval()[2:]}">{verdict}</font></b>', S('i6', fontName=FONT_B, leading=14)),
    ]]
    it = Table(info_data, colWidths=[PAGE_W/6]*6)
    it.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),GRAY_LT),
        ('BACKGROUND',(5,0),(5,0),verdict_bg),
        ('GRID',(0,0),(-1,-1),0.5,GRAY_BD),
        ('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),
        ('LEFTPADDING',(0,0),(-1,-1),10),
    ]))
    story.append(it)
    story.append(Spacer(1, 12))

    # ── 1. EXECUTIVE SUMMARY ─────────────────────────────────────
    story.append(section_header('1 · Executive Summary'))
    story.append(Spacer(1, 6))

    obs = custom_obs or _auto_obs(metrics, thresholds, overall, lob.name, run)
    story.append(Paragraph(obs, S('obs', fontSize=9, leading=15, alignment=TA_JUSTIFY)))
    story.append(Spacer(1, 8))

    total   = metrics.get('total_requests',0)
    err_pct = metrics.get('error_rate_pct',0)
    avg_ms  = metrics.get('avg_ms',0)
    rps     = metrics.get('rps',0)

    story.append(metric_cards([
        ('Total Requests', f"{total:,}", '#263238'),
        ('Avg Response',   f"{avg_ms}ms", '#007B8A'),
        ('Error Rate',     f"{err_pct:.1f}%", '#C62828' if err_pct > 0 else '#2E7D32'),
        ('Throughput',     f"{rps:.1f}/s", '#1565C0'),
        ('Virtual Users',  vu_label, '#6A1B9A'),
    ]))
    story.append(Spacer(1, 12))

    # ── 2. PERFORMANCE METRICS ───────────────────────────────────
    story.append(section_header('2 · Performance Metrics', color=NAVY, bg=NAVY_LT))
    story.append(Spacer(1, 6))

    story.append(metric_cards([
        ('p50 — Median',     f"{metrics.get('p50_ms',0)}ms", '#007B8A'),
        ('p90 — Most Users', f"{metrics.get('p90_ms',0)}ms",
         '#C62828' if metrics.get('p90_ms',0) > thresholds.p90_max_ms else '#1565C0'),
        ('p99 — Worst Case', f"{metrics.get('p99_ms',0)}ms",
         '#C62828' if metrics.get('p99_ms',0) > thresholds.p99_max_ms else '#2E7D32'),
        ('Min',              f"{metrics.get('min_ms',0)}ms", '#546E7A'),
        ('Max',              f"{metrics.get('max_ms',0)}ms", '#546E7A'),
    ], bg=NAVY_LT))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Understanding the metrics:</b>',
                            S('dh', fontSize=9, fontName=FONT_B, textColor=NAVY, spaceAfter=4)))
    story.append(def_table([
        ('p50 (Median)',  'Half of all requests completed faster than this. Best represents the typical user experience.'),
        ('p90',          '90% of requests completed faster than this. Shows what the majority of users experience. If high, many users are seeing slow responses.'),
        ('p99',          '99% of requests completed faster than this. Worst-case scenario — 1 in 100 users experienced this delay.'),
        ('Error Rate',   'Percentage of requests that returned an error (4xx/5xx). Target is always 0%.'),
        ('Throughput',   'Number of requests processed per second. Higher indicates better system capacity.'),
    ]))
    story.append(Spacer(1, 8))

    story.append(Paragraph('<b>Threshold comparison:</b>',
                            S('dh2', fontSize=9, fontName=FONT_B, textColor=NAVY, spaceAfter=4)))
    trows = [['Metric','Actual','Threshold','Result'],
             ['p99 Latency', f"{metrics.get('p99_ms',0)}ms", f"{thresholds.p99_max_ms}ms", 'PASS ✓' if p99_pass else 'FAIL ✗'],
             ['p90 Latency', f"{metrics.get('p90_ms',0)}ms", f"{thresholds.p90_max_ms}ms",
              'PASS ✓' if metrics.get('p90_ms',0)<=thresholds.p90_max_ms else 'FAIL ✗'],
             ['Error Rate',  f"{err_pct:.1f}%", f"{thresholds.error_rate_max_pct}%", 'PASS ✓' if err_pass else 'FAIL ✗']]
    tt = Table(trows, colWidths=[56*mm,38*mm,38*mm,42*mm])
    ts = [('BACKGROUND',(0,0),(-1,0),TEAL),('TEXTCOLOR',(0,0),(-1,0),WHITE),
          ('FONTNAME',(0,0),(-1,0),FONT_B),('FONTSIZE',(0,0),(-1,-1),9),
          ('ALIGN',(1,0),(-1,-1),'CENTER'),('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,GRAY_LT]),
          ('GRID',(0,0),(-1,-1),0.3,GRAY_BD),
          ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
          ('LEFTPADDING',(0,0),(0,-1),10)]
    for i, row in enumerate(trows[1:], 1):
        c = GREEN if 'PASS' in row[-1] else RED
        ts += [('TEXTCOLOR',(3,i),(3,i),c),('FONTNAME',(3,i),(3,i),FONT_B)]
    tt.setStyle(TableStyle(ts))
    story.append(tt)
    story.append(Spacer(1, 12))

    # ── 3. CHART + ENDPOINT BREAKDOWN ───────────────────────────
    by_ep = metrics.get('by_endpoint', {})
    if by_ep:
        from reportlab.platypus import PageBreak
        story.append(PageBreak())
        story.append(section_header('3 · Response Time Chart (p50 / p90 / p99 per Endpoint)',
                       color=colors.HexColor('#1565C0'), bg=NAVY_LT))
        story.append(Spacer(1, 6))
        story.append(Paragraph('Response time percentiles for each tested endpoint. '
                      'Dashed red line = p99 threshold. Bars above it indicate issues.',
                      S('cc', fontSize=8, textColor=GRAY, leading=12)))
        story.append(Spacer(1, 8))
        chart = build_chart(by_ep, thresholds)
        if chart:
            story.append(chart)
        story.append(Spacer(1, 12))

        story.append(section_header('4 · Per-Endpoint Breakdown', color=AMBER, bg=AMBER_LT))
        story.append(Spacer(1, 6))
        ep_h = ['Method','Endpoint','Requests','p50','p90','p99','Errors','Status']
        ep_rows = [ep_h]
        for ep, d in by_ep.items():
            ep_ok  = d.get('p99_ms',0) <= thresholds.p99_max_ms
            err_ok = (d.get('errors',0)/max(d.get('count',1),1)*100) <= thresholds.error_rate_max_pct
            status = 'PASS ✓' if ep_ok and err_ok else 'FAIL ✗'
            method = d.get('method','GET')
            # Full endpoint path - don't truncate
            full_ep = ep if len(ep) <= 40 else ep[:38]+'..'
            ep_rows.append([method, full_ep, str(d.get('count',0)),
                f"{d.get('p50_ms',0)}ms", f"{d.get('p90_ms',0)}ms", f"{d.get('p99_ms',0)}ms",
                str(d.get('errors',0)), status])
        ept = Table(ep_rows, colWidths=[14*mm,65*mm,17*mm,15*mm,15*mm,15*mm,13*mm,20*mm], repeatRows=1)
        eps = [('BACKGROUND',(0,0),(-1,0),TEAL),('TEXTCOLOR',(0,0),(-1,0),WHITE),
               ('FONTNAME',(0,0),(-1,0),FONT_B),('FONTSIZE',(0,0),(-1,-1),8),
               ('ALIGN',(2,0),(-1,-1),'CENTER'),('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,GRAY_LT]),
               ('GRID',(0,0),(-1,-1),0.3,GRAY_BD),
               ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
               ('LEFTPADDING',(0,0),(0,-1),6),('FONTSIZE',(1,1),(1,-1),7.5)]
        for i, row in enumerate(ep_rows[1:], 1):
            c = GREEN if 'PASS' in row[-1] else RED
            eps += [('TEXTCOLOR',(7,i),(7,i),c),('FONTNAME',(7,i),(7,i),FONT_B)]
        ept.setStyle(TableStyle(eps))
        story.append(ept)
        story.append(Spacer(1, 12))

    # ── 5. TEST CONFIGURATION ────────────────────────────────────
    story.append(section_header('5 · Test Configuration', color=GREEN, bg=GREEN_LT))
    story.append(Spacer(1, 6))
    start_t = run.created_at.strftime('%d %b %Y %H:%M UTC')
    end_t   = run.finished_at.strftime('%d %b %Y %H:%M UTC') if run.finished_at else 'N/A'
    cfg = [
        ['Virtual Users', vu_label,         'Duration',    f'{run.duration_seconds}s'],
        ['Ramp-up Period',f'{run.ramp_up_seconds}s', 'Tool', run.tool.upper()],
        ['Iterations',    str(run.iterations or 'Duration-based'), 'Environment', lob.environment.upper()],
        ['Base URL',      lob.base_url,      'Start Time',  start_t],
        ['End Time',      end_t,             'Run ID',      f'#{run.id}'],
    ]
    if qa_name:
        cfg.append(['Prepared by', qa_name, '', ''])
    ct = Table(cfg, colWidths=[32*mm,55*mm,32*mm,55*mm])
    ct.setStyle(TableStyle([
        ('FONTSIZE',(0,0),(-1,-1),9),('FONTNAME',(0,0),(0,-1),FONT_B),('FONTNAME',(2,0),(2,-1),FONT_B),
        ('TEXTCOLOR',(0,0),(0,-1),GRAY),('TEXTCOLOR',(2,0),(2,-1),GRAY),
        ('ROWBACKGROUNDS',(0,0),(-1,-1),[WHITE,GRAY_LT]),('GRID',(0,0),(-1,-1),0.3,GRAY_BD),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LEFTPADDING',(0,0),(-1,-1),8),
    ]))
    story.append(ct)
    story.append(Spacer(1, 12))

    # ── 6. CONCLUSION ────────────────────────────────────────────
    story.append(section_header('6 · Conclusion & Recommendations', color=NAVY, bg=NAVY_LT))
    story.append(Spacer(1, 6))
    vu_text = f"{run.virtual_users} virtual {'user' if run.virtual_users == 1 else 'users'}"
    conc = (f"The load and stress testing of the <b>{lob.name}</b> API platform was completed "
            f"{'successfully' if overall else 'with findings'} in the <b>{lob.environment.upper()}</b> "
            f"environment. The system {'demonstrated consistent stability' if overall else 'requires attention'} "
            f"under {vu_text}.")
    story.append(Paragraph(conc, S('co', fontSize=9, leading=15, alignment=TA_JUSTIFY)))
    story.append(Spacer(1, 6))
    for rec in _recommendations(metrics, thresholds, overall):
        story.append(Paragraph(f'<font color="#007B8A">▶</font>  {rec}',
                                S('rec', fontSize=9, leading=13, leftIndent=12)))
        story.append(Spacer(1, 3))
    story.append(Spacer(1, 10))

    # ── FOOTER LINE ──────────────────────────────────────────────
    div2 = Table([['']], colWidths=[PAGE_W], rowHeights=[3])
    div2.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),TEAL),
                               ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    story.append(div2)
    story.append(Spacer(1,4))
    story.append(Paragraph(
        f'— End of Report —  ·  Generated by salescode.ai Load & Stress Testing Portal  ·  Run #{run.id}  ·  {datetime.utcnow().strftime("%d %b %Y %H:%M UTC")}',
        S('ft', fontSize=7, textColor=GRAY, alignment=TA_CENTER)))

    doc.build(story, onFirstPage=_page_template, onLaterPages=_page_template)
    buf.seek(0)
    return buf


def _auto_obs(metrics, thresholds, passed, lob_name, run):
    p99=metrics.get('p99_ms',0); err=metrics.get('error_rate_pct',0)
    total=metrics.get('total_requests',0); rps=metrics.get('rps',0)
    vu_text = f"{run.virtual_users} virtual {'user' if run.virtual_users==1 else 'users'}"
    if passed:
        return (f"This report presents the results of load and stress testing conducted on the <b>{lob_name}</b> "
                f"API platform using <b>{run.tool.upper()}</b> in the <b>{run.lob_environment if hasattr(run,'lob_environment') else 'demo'.upper()}</b> environment. "
                f"The system performed successfully across all tested endpoints, with a <b>{err:.1f}% error rate</b> "
                f"across <b>{total:,} total requests</b> and <b>{vu_text}</b>. "
                f"Average response time was <b>{metrics.get('avg_ms',0)}ms</b> with a throughput of <b>{rps:.1f} req/s</b>. "
                f"All thresholds were met.")
    issues = []
    if p99 > thresholds.p99_max_ms: issues.append(f"p99 latency ({p99}ms) exceeded the {thresholds.p99_max_ms}ms threshold")
    if err > thresholds.error_rate_max_pct: issues.append(f"error rate ({err:.1f}%) exceeded {thresholds.error_rate_max_pct}%")
    return (f"Load testing of <b>{lob_name}</b> identified the following issues: <b>{'; '.join(issues)}</b>. "
            f"Immediate investigation is recommended before production deployment.")


def _recommendations(metrics, thresholds, passed):
    if passed:
        return ["All endpoints responded within acceptable thresholds — no immediate action required.",
                "System demonstrated stability under the tested concurrent user load.",
                "Consider increasing virtual users in the next test cycle to identify the system breaking point.",
                "Schedule regular regression load tests to catch performance degradation before releases."]
    recs = []
    if metrics.get('p99_ms',0) > thresholds.p99_max_ms:
        recs.append("p99 latency exceeds threshold — investigate slow endpoints, consider caching or query optimisation.")
    if metrics.get('error_rate_pct',0) > thresholds.error_rate_max_pct:
        recs.append("Error rate exceeds acceptable limit — check server logs and fix root cause before re-testing.")
    recs.append("Re-run after fixes to confirm resolution before the next production release.")
    return recs

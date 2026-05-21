import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime

def _load_env():
    env = {}
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip()
    return env

def send_report_email(to_email, lob_name, environment, metrics, pdf_buf, run_id, verdict):
    env = _load_env()
    username = env.get('MAIL_USERNAME', '')
    password = env.get('MAIL_PASSWORD', '').replace(' ', '')

    if not username or not password:
        raise ValueError("Email credentials not configured. Check backend/.env file.")

    subject = f"Load Test Report — {lob_name}"

    html = f"""
<html><body style="font-family:Arial,sans-serif;color:#263238;max-width:640px;margin:0 auto;border:1px solid #e0e0e0;">

  <!-- Body -->
  <div style="padding:32px 30px;">
    <p style="font-size:15px;margin:0 0 20px;">Hi Team,</p>

    <p style="font-size:14px;line-height:1.8;margin:0 0 16px;">
      The load testing activity has been successfully completed.
    </p>

    <p style="font-size:14px;line-height:1.8;margin:0 0 16px;">
      Please find the attached load testing report for your reference and review.
      The report includes detailed observations, performance metrics, response times,
      throughput, and overall test summary.
    </p>

    <p style="font-size:14px;line-height:1.8;margin:0 0 32px;">
      Kindly review the attached report.
    </p>

    <p style="font-size:14px;margin:0;">
      Regards,<br>
      <strong>QA Engineering Team</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background:#F5F7F8;padding:12px 30px;border-top:3px solid #0bacaa;">
    <p style="font-size:11px;color:#90A4AE;margin:0;">
      Run #{run_id} · {lob_name} · {environment.upper()} · {datetime.utcnow().strftime('%d %b %Y %H:%M UTC')}
    </p>
  </div>

</body></html>
"""

    # Support multiple comma-separated emails
    recipients = [e.strip() for e in to_email.split(',') if e.strip()]

    msg = MIMEMultipart('mixed')
    msg['From']    = f'QA Engineering Team <{username}>'
    msg['To']      = ', '.join(recipients)
    msg['Subject'] = subject
    msg['X-Mailer'] = 'salescode-loadtest-portal'
    msg.attach(MIMEText(html, 'html', 'utf-8'))

    if pdf_buf:
        pdf_buf.seek(0)
        att = MIMEBase('application', 'pdf')
        att.set_payload(pdf_buf.read())
        encoders.encode_base64(att)
        att.add_header('Content-Disposition', f'attachment; filename="LoadTest_{lob_name}_Run{run_id}.pdf"')
        msg.attach(att)

    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
        server.login(username, password)
        server.sendmail(username, recipients, msg.as_string())

    print(f"[email] Sent to {recipients} — {lob_name} Run #{run_id} {verdict}")

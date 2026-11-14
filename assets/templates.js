/* Built-in email templates.
   Merge fields:  {{Field}}  {{Field|fallback}}  {{Field:url}}
   A field is filled from the matching spreadsheet column first
   (case, spaces and underscores ignored), then from Campaign variables. */
window.OUTREACH_TEMPLATES = [
  {
    "id": "designed-outreach",
    "name": "Designed outreach email",
    "subject": "A quick idea for {{Company|your team}}",
    "variables": {
      "COMPANY_NAME": "Your Company",
      "ACCENT": "#0071E3",
      "EYEBROW": "For growing teams",
      "HEADLINE": "Great work deserves<br>to be noticed.",
      "HOOK": "I came across {{Company|your work}} and really liked what you're doing.",
      "PITCH": "We help businesses like yours with the parts that take the most time, so you can focus on the work you love.",
      "SERVICE_1_TITLE": "Service one",
      "SERVICE_1_TEXT": "One sentence on what this is and why it helps.",
      "SERVICE_2_TITLE": "Service two",
      "SERVICE_2_TEXT": "One sentence on what this is and why it helps.",
      "SERVICE_3_TITLE": "Service three",
      "SERVICE_3_TEXT": "One sentence on what this is and why it helps.",
      "OFFER_TITLE": "Free sample",
      "OFFER": "Reply to this email and I'll put together a free sample for {{Company|you}}, no strings attached.",
      "CTA_LABEL": "Visit our website",
      "WEBSITE": "https://example.com",
      "WEBSITE_LABEL": "example.com"
    },
    "html": "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" bgcolor=\"#F2F2F4\"><tr><td align=\"center\" bgcolor=\"#F2F2F4\" style=\"padding:28px 12px;\"><table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" bgcolor=\"#FFFFFF\" style=\"width:100%;max-width:600px;border-radius:14px;\"><tr><td bgcolor=\"#FFFFFF\" style=\"padding:26px 36px 0 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:-.01em;color:#1D1D1F;\">{{COMPANY_NAME}}</td></tr><tr><td bgcolor=\"#FFFFFF\" style=\"padding:28px 36px 6px 36px;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:{{ACCENT}};\">{{EYEBROW}}</div><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;letter-spacing:-.02em;color:#1D1D1F;padding:12px 0 20px 0;\">{{HEADLINE}}</div><p style=\"margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;line-height:25px;color:#333336;\">Hi {{First Name|there}},</p><p style=\"margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;line-height:25px;color:#333336;\">{{HOOK}}</p><p style=\"margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;line-height:25px;color:#333336;\">{{PITCH}}</p></td></tr><tr><td bgcolor=\"#FFFFFF\" style=\"padding:4px 36px 26px 36px;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-top:1px solid #E3E3E6;\"><tr><td style=\"padding:18px 0;border-bottom:1px solid #E3E3E6;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:600;color:#1D1D1F;line-height:24px;\">{{SERVICE_1_TITLE}}</div><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;line-height:22px;color:#515154;padding-top:4px;\">{{SERVICE_1_TEXT}}</div></td></tr><tr><td style=\"padding:18px 0;border-bottom:1px solid #E3E3E6;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:600;color:#1D1D1F;line-height:24px;\">{{SERVICE_2_TITLE}}</div><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;line-height:22px;color:#515154;padding-top:4px;\">{{SERVICE_2_TEXT}}</div></td></tr><tr><td style=\"padding:18px 0;border-bottom:1px solid #E3E3E6;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:600;color:#1D1D1F;line-height:24px;\">{{SERVICE_3_TITLE}}</div><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;line-height:22px;color:#515154;padding-top:4px;\">{{SERVICE_3_TEXT}}</div></td></tr></table></td></tr><tr><td bgcolor=\"#F5F5F7\" style=\"padding:26px 36px;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:{{ACCENT}};\">{{OFFER_TITLE}}</div><p style=\"margin:10px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;line-height:25px;color:#1D1D1F;\">{{OFFER}}</p></td></tr><tr><td bgcolor=\"#FFFFFF\" style=\"padding:30px 36px 32px 36px;\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td bgcolor=\"{{ACCENT}}\" style=\"border-radius:999px;\"><a href=\"{{WEBSITE}}\" target=\"_blank\" style=\"display:inline-block;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px;\">{{CTA_LABEL}} &rarr;</a></td><td width=\"10\"></td><td style=\"border:1px solid #D2D2D7;border-radius:999px;\"><a href=\"mailto:{{SENDER_EMAIL}}\" style=\"display:inline-block;padding:11px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;font-weight:500;color:#1D1D1F;text-decoration:none;\">Reply to enquire</a></td></tr></table></td></tr><tr><td bgcolor=\"#FFFFFF\" style=\"padding:20px 36px 26px 36px;border-top:1px solid #E3E3E6;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:19px;color:#6E6E73;\"><b style=\"color:#1D1D1F;\">{{COMPANY_NAME}}</b><br>{{SENDER_EMAIL}} &middot; <a href=\"{{WEBSITE}}\" style=\"color:{{ACCENT}};text-decoration:none;\">{{WEBSITE_LABEL}}</a></div><p style=\"margin:14px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;line-height:17px;color:#86868B;\">Not the right fit? Just reply &ldquo;no thanks&rdquo; and I won&rsquo;t email again.</p></td></tr></table></td></tr></table>",
    "text": "Hi {{First Name|there}},\n\n{{HOOK}}\n\n{{PITCH}}\n\n- {{SERVICE_1_TITLE}}: {{SERVICE_1_TEXT}}\n- {{SERVICE_2_TITLE}}: {{SERVICE_2_TEXT}}\n- {{SERVICE_3_TITLE}}: {{SERVICE_3_TEXT}}\n\n{{OFFER}}\n\n{{SENDER_NAME}}\n{{COMPANY_NAME}} | {{WEBSITE}}\n\nNot the right fit? Just reply \"no thanks\" and I won't email again."
  },
  {
    "id": "simple-personal",
    "name": "Simple personal email",
    "subject": "Quick idea for {{Company|your team}}",
    "variables": {
      "COMPANY_NAME": "Your Company",
      "OFFER": "a free sample so you can see the difference before spending anything"
    },
    "html": "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px;\"><p>Hi {{First Name|there}},</p><p>I came across {{Company|your work}} and wanted to reach out. At {{COMPANY_NAME}} we help teams like yours, and I&rsquo;d love to offer {{OFFER}}.</p><p>Would you be open to a quick chat this week?</p><p>Best,<br>{{SENDER_NAME}}<br>{{COMPANY_NAME}}</p><p style=\"font-size:12px;color:#888;\">Not interested? Reply &ldquo;no thanks&rdquo; and I won&rsquo;t email again.</p></div>",
    "text": "Hi {{First Name|there}},\n\nI came across {{Company|your work}} and wanted to reach out. At {{COMPANY_NAME}} we help teams like yours, and I'd love to offer {{OFFER}}.\n\nWould you be open to a quick chat this week?\n\nBest,\n{{SENDER_NAME}}\n{{COMPANY_NAME}}\n\nNot interested? Reply \"no thanks\" and I won't email again."
  },
  {
    "id": "blank",
    "name": "Blank (write your own)",
    "subject": "",
    "variables": {},
    "html": "<p>Hi {{First Name|there}},</p>\n<p></p>",
    "text": ""
  }
];

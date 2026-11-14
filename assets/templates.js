/* Built-in email templates.
   Merge fields:  {{Field}}  {{Field|fallback}}  {{Field:url}}  {{Field:raw}}
   Lookup order: spreadsheet column (case, spaces and underscores ignored)
   -> "Describe the email" answers (campaign variables) -> built-ins.
   Built-ins come from Company details and the Gmail account: COMPANY_NAME,
   COMPANY_EMAIL, COMPANY_PHONE, WEBSITE, WEBSITE_LABEL, HEADER_TEXT, FOOTER_TEXT,
   ACCENT, LOGO (an <img>, use :raw), COMPANY_CONTACT (html, use :raw),
   COMPANY_CONTACT_TEXT, SENDER_NAME, SENDER_EMAIL, EMAIL, NAME.
   `fields` describes the form shown in "Describe the email". */
window.OUTREACH_TEMPLATES = [
  {
    "id": "designed-outreach",
    "name": "Designed outreach email (logo, header & footer)",
    "subject": "A quick idea for {{Company|your team}}",
    "fields": [
      {
        "key": "EYEBROW",
        "label": "Who it's for",
        "hint": "Small line above the headline, e.g. “For independent cafés”."
      },
      {
        "key": "HEADLINE",
        "label": "Headline",
        "hint": "Big opening line. Use <br> for a line break.",
        "multiline": true
      },
      {
        "key": "HOOK",
        "label": "Opening line",
        "hint": "Personal first sentence. {{Company}} and {{First Name}} fill from your sheet; a “Hook” column overrides it per client.",
        "multiline": true
      },
      {
        "key": "PITCH",
        "label": "What you do",
        "hint": "One or two sentences on what you offer and why it matters to them.",
        "multiline": true
      },
      {
        "key": "SERVICE_1_TITLE",
        "label": "Service 1 · title"
      },
      {
        "key": "SERVICE_1_TEXT",
        "label": "Service 1 · one line",
        "multiline": true
      },
      {
        "key": "SERVICE_2_TITLE",
        "label": "Service 2 · title"
      },
      {
        "key": "SERVICE_2_TEXT",
        "label": "Service 2 · one line",
        "multiline": true
      },
      {
        "key": "SERVICE_3_TITLE",
        "label": "Service 3 · title"
      },
      {
        "key": "SERVICE_3_TEXT",
        "label": "Service 3 · one line",
        "multiline": true
      },
      {
        "key": "OFFER_TITLE",
        "label": "Offer · title",
        "hint": "e.g. “Free sample” or “Introductory rate”."
      },
      {
        "key": "OFFER",
        "label": "Offer · details",
        "multiline": true
      },
      {
        "key": "CTA_LABEL",
        "label": "Button text",
        "hint": "Links to your website from Company details."
      },
      {
        "key": "REPLY_LABEL",
        "label": "Reply button text"
      },
      {
        "key": "OPT_OUT",
        "label": "Opt-out line",
        "hint": "Keep one; it's required for marketing email in most countries.",
        "multiline": true
      }
    ],
    "variables": {
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
      "REPLY_LABEL": "Reply to enquire",
      "OPT_OUT": "Not the right fit? Just reply “no thanks” and I won't email again."
    },
    "html": "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" bgcolor=\"#F2F2F4\"><tr><td align=\"center\" bgcolor=\"#F2F2F4\" style=\"padding:28px 12px;\"><table role=\"presentation\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" bgcolor=\"#FFFFFF\" style=\"width:100%;max-width:600px;border-radius:14px;\"><tr><td bgcolor=\"#FFFFFF\" style=\"padding:26px 36px 0 36px;\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td valign=\"middle\" style=\"padding-right:12px;\">{{LOGO:raw}}</td><td valign=\"middle\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:-.01em;color:#1D1D1F;line-height:20px;\">{{COMPANY_NAME}}</div><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;color:#6E6E73;line-height:18px;\">{{HEADER_TEXT}}</div></td></tr></table></td></tr><tr><td bgcolor=\"#FFFFFF\" style=\"padding:28px 36px 6px 36px;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:{{ACCENT}};\">{{EYEBROW}}</div><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;font-weight:700;letter-spacing:-.02em;color:#1D1D1F;padding:12px 0 20px 0;\">{{HEADLINE}}</div><p style=\"margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;line-height:25px;color:#333336;\">Hi {{First Name|there}},</p><p style=\"margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;line-height:25px;color:#333336;\">{{HOOK}}</p><p style=\"margin:0 0 14px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;line-height:25px;color:#333336;\">{{PITCH}}</p></td></tr><tr><td bgcolor=\"#FFFFFF\" style=\"padding:4px 36px 26px 36px;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"border-top:1px solid #E3E3E6;\"><tr><td style=\"padding:18px 0;border-bottom:1px solid #E3E3E6;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:600;color:#1D1D1F;line-height:24px;\">{{SERVICE_1_TITLE}}</div><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;line-height:22px;color:#515154;padding-top:4px;\">{{SERVICE_1_TEXT}}</div></td></tr><tr><td style=\"padding:18px 0;border-bottom:1px solid #E3E3E6;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:600;color:#1D1D1F;line-height:24px;\">{{SERVICE_2_TITLE}}</div><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;line-height:22px;color:#515154;padding-top:4px;\">{{SERVICE_2_TEXT}}</div></td></tr><tr><td style=\"padding:18px 0;border-bottom:1px solid #E3E3E6;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:600;color:#1D1D1F;line-height:24px;\">{{SERVICE_3_TITLE}}</div><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;line-height:22px;color:#515154;padding-top:4px;\">{{SERVICE_3_TEXT}}</div></td></tr></table></td></tr><tr><td bgcolor=\"#F5F5F7\" style=\"padding:26px 36px;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:{{ACCENT}};\">{{OFFER_TITLE}}</div><p style=\"margin:10px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15.5px;line-height:25px;color:#1D1D1F;\">{{OFFER}}</p></td></tr><tr><td bgcolor=\"#FFFFFF\" style=\"padding:30px 36px 32px 36px;\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr><td bgcolor=\"{{ACCENT}}\" style=\"border-radius:999px;\"><a href=\"{{WEBSITE}}\" target=\"_blank\" style=\"display:inline-block;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px;\">{{CTA_LABEL}} &rarr;</a></td><td width=\"10\"></td><td style=\"border:1px solid #D2D2D7;border-radius:999px;\"><a href=\"mailto:{{COMPANY_EMAIL}}\" style=\"display:inline-block;padding:11px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;font-weight:500;color:#1D1D1F;text-decoration:none;\">{{REPLY_LABEL}}</a></td></tr></table></td></tr><tr><td bgcolor=\"#FFFFFF\" style=\"padding:20px 36px 26px 36px;border-top:1px solid #E3E3E6;\"><div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:19px;color:#6E6E73;\"><b style=\"color:#1D1D1F;\">{{COMPANY_NAME}}</b><br>{{COMPANY_CONTACT:raw}}</div><p style=\"margin:12px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6E6E73;\">{{FOOTER_TEXT}}</p><p style=\"margin:12px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;line-height:17px;color:#86868B;\">{{OPT_OUT}}</p></td></tr></table></td></tr></table>",
    "text": "Hi {{First Name|there}},\n\n{{HOOK}}\n\n{{PITCH}}\n\n- {{SERVICE_1_TITLE}}: {{SERVICE_1_TEXT}}\n- {{SERVICE_2_TITLE}}: {{SERVICE_2_TEXT}}\n- {{SERVICE_3_TITLE}}: {{SERVICE_3_TEXT}}\n\n{{OFFER_TITLE}}: {{OFFER}}\n\n{{SENDER_NAME}}\n{{COMPANY_NAME}}\n{{COMPANY_CONTACT_TEXT}}\n{{FOOTER_TEXT}}\n\n{{OPT_OUT}}"
  },
  {
    "id": "simple-personal",
    "name": "Simple personal email (no design)",
    "subject": "Quick idea for {{Company|your team}}",
    "fields": [
      {
        "key": "HOOK",
        "label": "Opening line",
        "multiline": true
      },
      {
        "key": "PITCH",
        "label": "What you do",
        "multiline": true
      },
      {
        "key": "OFFER",
        "label": "Offer",
        "multiline": true
      },
      {
        "key": "ASK",
        "label": "The ask"
      },
      {
        "key": "OPT_OUT",
        "label": "Opt-out line",
        "multiline": true
      }
    ],
    "variables": {
      "HOOK": "I came across {{Company|your work}} and wanted to reach out.",
      "PITCH": "At {{COMPANY_NAME}} we help teams like yours with the work that takes the most time.",
      "OFFER": "I'd love to offer a free sample so you can see the difference before spending anything.",
      "ASK": "Would you be open to a quick chat this week?",
      "OPT_OUT": "Not interested? Reply “no thanks” and I won't email again."
    },
    "html": "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px;\"><p>Hi {{First Name|there}},</p><p>{{HOOK}} {{PITCH}}</p><p>{{OFFER}}</p><p>{{ASK}}</p><p>Best,<br>{{SENDER_NAME}}<br>{{COMPANY_NAME}}<br><span style=\"color:#666;font-size:13px;\">{{COMPANY_CONTACT:raw}}</span></p><p style=\"font-size:12px;color:#888;\">{{OPT_OUT}}</p></div>",
    "text": "Hi {{First Name|there}},\n\n{{HOOK}} {{PITCH}}\n\n{{OFFER}}\n\n{{ASK}}\n\nBest,\n{{SENDER_NAME}}\n{{COMPANY_NAME}}\n{{COMPANY_CONTACT_TEXT}}\n\n{{OPT_OUT}}"
  },
  {
    "id": "blank",
    "name": "Blank (write your own HTML)",
    "subject": "",
    "fields": [],
    "variables": {},
    "html": "<p>Hi {{First Name|there}},</p>\n<p></p>\n<p>{{SENDER_NAME}}<br>{{COMPANY_NAME}}<br>{{COMPANY_CONTACT:raw}}</p>",
    "text": ""
  }
];

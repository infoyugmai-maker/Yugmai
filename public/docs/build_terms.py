import sys

# Read template
with open('privacy.html', 'r', encoding='utf-8') as f:
    template = f.read()

# Split template at content
pre, post = template.split('<div class="privacy-content"', 1)
post_start = post.find('>') + 1
post_end = post.rfind('</div>')
footer = post[post_end:]

header = pre + '<div class="privacy-content" style="color: var(--white); line-height: 1.7;">\n'
header = header.replace('Privacy Policy - YUGM AI', 'Terms of Service - YUGM AI')
header = header.replace('Privacy Policy</h1>', 'Terms of Service</h1>')
header = header.replace('Comprehensive Data Protection & Privacy Framework<br>', 'Master Vendor Agreement & Terms of Service<br>')

with open('vendor_agreement_utf8.txt', 'r', encoding='utf-8') as f:
    lines = f.readlines()

html_content = ''
for line in lines:
    line = line.strip()
    if not line:
        continue
    if line[0].isdigit() and '.' in line and ' ' in line:
        html_content += f'<h3 style="margin-top: 1.5rem; margin-bottom: 0.5rem; color: var(--blue-2);">{line}</h3>\n'
    elif line == line.upper() and len(line) > 5:
        html_content += f'<h2 style="margin-top: 2.5rem; margin-bottom: 1rem; color: var(--blue-2);">{line}</h2>\n'
    else:
        html_content += f'<p>{line}</p>\n'

with open('terms.html', 'w', encoding='utf-8') as f:
    f.write(header + html_content + footer)

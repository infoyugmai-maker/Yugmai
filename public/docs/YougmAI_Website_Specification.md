# YUGM AI — Full Website Specification

**Document Version:** 1.0  
**Prepared for:** Development Team  
**Project:** YUGM AI  
**Sub-Company:** Monetization X  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Design System](#2-design-system)
3. [Site Architecture & Navigation](#3-site-architecture--navigation)
4. [Homepage](#4-homepage)
5. [Authentication — Login & Register](#5-authentication--login--register)
6. [Vendor / Freelancer / Company Dashboard](#6-vendor--freelancer--company-dashboard)
7. [Admin Panel](#7-admin-panel)
8. [Footer Specification](#8-footer-specification)
9. [AI Chatbot (UMAI)](#9-ai-chatbot-umai)
10. [Floating Action Shortcuts](#10-floating-action-shortcuts)
11. [Contact Page](#11-contact-page)
12. [Push Notifications System](#12-push-notifications-system)
13. [General Developer Notes](#13-general-developer-notes)

---

## 1. Project Overview

**Website Name:** YUGM AI  
**Sub-Company / Associate Brand:** Monetization X  
**Nature of Business:** AI data services — including but not limited to data recording, annotation, transcription, and related AI training data workflows. The platform connects freelancers, vendors, and companies to ongoing AI data projects.  
**Headquarters:** Delhi, India — Serving Globally  

**Core Purpose of the Website:**
- Present YUGM AI's services and ongoing projects to the world.
- Allow freelancers, vendors, and companies to register, join projects, submit work, and communicate with the admin team.
- Provide the admin team a full-control panel to manage projects, participants, work submissions, messages, registrations, and contacts.
- Feature an AI-powered chatbot (UMAI) on the homepage that can answer questions about the website and general queries.

---

## 2. Design System

### 2.1 General Aesthetic

- **Tone:** Clean, professional, corporate-tech. Think precision and trust — no clutter.
- **Inspiration Reference:** PE and VRI studio-style visual language. Structured, content-dense but well-spaced, with strong typographic hierarchy.
- **No emojis anywhere on the entire website.** This is an absolute rule. Not in body copy, not in buttons, not in tooltips, not in chat messages, not in the admin panel — nowhere. Use iconography (SVG icons, line icons from a library such as Lucide or Heroicons) instead of emojis.

### 2.2 Color Palette (Recommended Starting Point — Developer may refine)

| Role | Color |
|---|---|
| Primary Brand | Deep Navy `#0A1628` or Dark Slate |
| Accent / CTA | Strong Electric Blue `#1A73E8` or Teal |
| Background (light sections) | Off-White `#F8F9FA` |
| Background (dark sections) | Near Black `#0D1117` |
| Text Primary | `#111827` |
| Text Secondary / Muted | `#6B7280` |
| Border / Dividers | `#E5E7EB` |
| Success | `#16A34A` |
| Warning | `#D97706` |
| Danger / Reject | `#DC2626` |
| Chat — User Bubble (green) | `#25D366` (WhatsApp green) or brand equivalent |
| Chat — Admin/AI Bubble (gray) | `#E9E9EB` |

> Note: The primary color identity (navy vs. black vs. dark teal) should be decided with the client before final implementation. The above is a reference palette.

### 2.3 Typography

- **Display / Heading Font:** A distinctive, refined sans-serif — suggestions: `Syne`, `Neue Montreal`, `Clash Display`, or `DM Sans Bold`. Avoid Inter, Roboto, and Arial.
- **Body Font:** `General Sans`, `Satoshi`, or `Plus Jakarta Sans` — clean and readable.
- **Monospace (for IDs, codes, logs):** `JetBrains Mono` or `IBM Plex Mono`.
- Load via Google Fonts or Fontsource.

### 2.4 Iconography

- Use a consistent icon library throughout. Recommended: **Lucide Icons** or **Heroicons** (both free, SVG-based, no emojis).
- Icons should be used to represent actions, categories, and status — never decorative emojis.

### 2.5 Spacing & Layout

- Use an 8px base grid system.
- Section padding: minimum `80px` top/bottom on desktop, `48px` on mobile.
- Max content width: `1280px`, centered.
- Use CSS Grid and Flexbox. No tables for layout.

### 2.6 Responsive Breakpoints

| Breakpoint | Width |
|---|---|
| Mobile | `< 768px` |
| Tablet | `768px – 1024px` |
| Desktop | `> 1024px` |

---

## 3. Site Architecture & Navigation

### 3.1 Primary Navigation (Header)

The top navigation bar is sticky on scroll. It contains:

| Item | Behavior |
|---|---|
| **Logo + "YUGM AI"** | Clicking returns to Homepage |
| **Services** | Dropdown listing AI data services offered |
| **How We Work** | Anchor link or separate page explaining the process |
| **Contact** | Navigates to the Contact page |
| **Monetization X** | Direct external link — redirects to `https://monetizationx.in` in a new tab. No internal page, no dropdown. |
| **Login** | Opens the Login page |
| **Register** | Opens the Register page |

On mobile, the nav collapses to a hamburger menu. Login and Register are always visible as CTA buttons.

### 3.2 Full Site Page Map

```
/ (Homepage)
/login
/register
/dashboard (protected — freelancer/vendor/company)
  /dashboard/projects
  /dashboard/my-projects
  /dashboard/submit-work
  /dashboard/messages
  /dashboard/profile
/admin (protected — admin only)
  /admin/overview
  /admin/projects
  /admin/projects/create
  /admin/projects/[id]/edit
  /admin/participation
  /admin/work-tracking
  /admin/messages
  /admin/registrations
  /admin/contacts
  /admin/signin-logs
/contact
```

---

## 4. Homepage

The homepage is the public face of the platform. It is structured as a series of full-width sections stacked vertically. All sections are scroll-animated (fade-in, slide-up on scroll).

---

### Section 1 — Hero / Intro

**Purpose:** First impression. Communicate what YUGM AI does and who it is for.

**Layout:**
- Full-width, dark background (brand dark).
- Large display heading (2–3 lines max).
- Subheading (1–2 lines): brief description of services.
- Two CTA buttons:
  - Primary: "Explore Projects" — scrolls to the Live Projects section.
  - Secondary: "Work With Us" — redirects to `/register`.
- A subtle background texture, grid pattern, or animated mesh gradient — no stock photos of people.

**Copy Direction (developer placeholder):**
```
HEADING:    Powering AI With Real Human Data
SUBHEADING: YUGM AI connects global talent with live AI data projects — 
            from transcription to annotation, we build the backbone of AI.
```

---

### Section 2 — Live / Ongoing Projects

**Purpose:** Show visitors that the platform is actively running projects. This creates trust and urgency.

**Layout:**
- Section heading: "Live Projects" or "Active Projects"
- A horizontal card row or 3-column grid of project cards.
- Each card shows:
  - Project Name
  - Work Type (e.g., Transcription, Annotation, Recording)
  - Status badge: `ACTIVE` or `UPCOMING` (no emojis — use a colored dot + text label)
  - Language(s)
  - Team size needed
  - A "Join Project" or "View Details" button — redirects to `/register` if not logged in, or to the project detail if logged in.
- Projects in this section are fetched dynamically from the backend (admin-managed).
- If no live projects exist, show a placeholder: "New projects launching soon. Register to be notified."

---

### Section 3 — What We Do / Services Overview

**Purpose:** High-level snapshot of capabilities. Not a full services page — just key highlights.

**Layout:**
- Section heading: "What We Do"
- 3–4 service cards or feature blocks, icon + title + 2-line description.
- Example services (confirm with client):
  - AI Data Recording
  - Speech & Audio Annotation
  - Transcription Services
  - Data Quality & Review
- Each card can have a subtle hover animation (lift/border glow).
- A "Learn More" CTA at the bottom redirects to the full services page or the "How We Work" section.

---

### Section 4 — How We Work (Process)

**Purpose:** Build trust by showing the workflow.

**Layout:**
- 3 or 4 steps in a horizontal timeline or numbered list with lines connecting them.
- Each step: Step number + Title + 1–2 line description.
- Example steps:
  1. Register — Create your account as a freelancer, vendor, or company.
  2. Join a Project — Browse live projects and apply to participate.
  3. Submit Your Work — Complete sessions and submit via the dashboard.
  4. Get Reviewed & Paid — Admin reviews submissions and processes payment.
- No emojis in step icons — use numbered circles or SVG icons.

---

### Section 5 — Work With Us (Freelancer / Vendor CTA)

**Purpose:** Direct recruitment section for the workforce.

**Layout:**
- Split layout (50/50 or 60/40): left side is descriptive text, right side is a styled CTA card.
- Heading: "Work With Us as a Freelancer or Vendor"
- Body copy: Short paragraph about what types of workers are needed and what they gain.
- Two CTA buttons:
  - "Register as Freelancer" — goes to `/register`
  - "Register as Vendor / Company" — goes to `/register`
- This section is placed so it appears when users scroll down slightly from the hero — making it visible early.

---

### Section 6 — Global Reach / Activity Strip (Optional but Recommended)

**Purpose:** "What the world is doing" — a live-feel indicator of platform activity.

**Layout:**
- A compact strip or ticker with real or static stats:
  - Total Registered Participants
  - Projects Completed
  - Languages Supported
  - Countries Represented
- Numbers are large and bold. Labels are small and muted.
- Optionally animated counting-up effect on scroll-into-view.

---

### Section 7 — About / Philosophy Teaser

**Purpose:** Brief brand statement — who YUGM AI is and what they believe in.

**Layout:**
- Dark background section.
- A short manifesto-style paragraph or blockquote.
- Optional: A "Read More" link to a full About page.

---

### Floating Elements on Homepage (Always Visible)

See Section 9 (Chatbot) and Section 10 (Floating Shortcuts).

---

## 5. Authentication — Login & Register

### 5.1 Register Page (`/register`)

**Account Type Selection:**
- Before filling any fields, the user first selects their account type. This is shown as a 3-option selector (large toggle cards, not a dropdown):
  - Freelancer
  - Vendor
  - Company
- The selection is visually distinct (selected card highlighted with brand color border/background).

**Registration Form Fields:**

| Field | Type | Required |
|---|---|---|
| Full Name | Text input | Yes |
| Email Address | Email input | Yes |
| Phone Number | Tel input | Yes |
| Company Name | Text input | No (optional) |
| Password | Password input | Yes |
| Confirm Password | Password input | Yes |

- A "Create Account" button submits the form.
- Below the form: "Or continue with Google" — triggers Google OAuth.

**Password Rules (show inline):**
- Minimum 8 characters
- At least one uppercase, one number

**On successful registration:** Redirect to `/dashboard`.

---

### 5.2 Google Sign-In Flow

1. User clicks "Continue with Google."
2. Google OAuth popup/redirect completes — email and name are captured.
3. **Before reaching the dashboard, a modal/popup appears** with the following fields:
   - Account Type selector (Freelancer / Vendor / Company) — required
   - Phone Number — required
   - Company Name — optional
4. User fills in the required fields and clicks "Complete Registration."
5. Account is created and user is redirected to `/dashboard`.

---

### 5.3 Login Page (`/login`)

**Fields:**

| Field | Type |
|---|---|
| Email Address | Email input |
| Password | Password input |

- "Sign In" button.
- "Forgot Password?" link.
- "Or continue with Google" — same Google OAuth flow. If account already exists, goes directly to dashboard. If new, triggers the completion popup (same as above).
- Link to Register page for new users.

---

## 6. Vendor / Freelancer / Company Dashboard

All three account types (Freelancer, Vendor, Company) use the same dashboard layout. The dashboard is a protected route — redirect to `/login` if not authenticated.

### 6.1 Dashboard Layout

- **Left Sidebar Navigation** (collapsible on mobile):
  - Home (Overview)
  - Projects
  - My Projects
  - Submit Work
  - Messages
  - Profile
- **Top Bar:** Logo, user name/avatar, logout button.
- **Main Content Area:** Changes based on selected section.

---

### 6.2 Home / Overview Screen

**Stats Row (4 cards at top):**

| Stat Card | Description |
|---|---|
| Available Projects | Total open projects the user can join |
| Projects Joined | Total projects the user is currently enrolled in |
| Completed Projects | Total projects marked as complete |
| Pending Review | Work submissions awaiting admin review |

**Recent Projects Panel:**
- Below the stats, a "Recent Projects" section shows 3–5 cards of the most recently active projects.
- Each card: Project Name, Work Type, Status badge, Language, "View & Join" button.
- Clicking "View & Join" opens the project detail modal or page.

---

### 6.3 Projects Screen

**Purpose:** Browse all available and upcoming projects.

**Layout:**
- Filter bar at top: filter by Work Type, Language, Status.
- Project cards in a grid (2 columns on desktop, 1 on mobile).
- Each card shows: Project Name, Work Type, Status, Languages, Team Size Needed, Deadline (or "No Deadline"), Rate indicator.
- "Join Project" button on each card — opens a registration/confirmation modal.
- On clicking "Join Project": User confirms participation. System records the registration. Admin sees this in the Participation section.

---

### 6.4 My Projects Screen

**Purpose:** View all projects the user has joined.

**Layout:**
- List/table of enrolled projects.
- Columns: Project Name, Work Type, Date Joined, Status, Action ("View Details" / "Submit Work").

---

### 6.5 Submit Work Screen

**Purpose:** Log completed work sessions for admin review.

**Form Fields:**

| Field | Type | Required |
|---|---|---|
| Session Label | Text — auto-labeled "New Session" but editable | Yes |
| Project | Dropdown — lists only projects the user has joined | Yes |
| Work Type | Dropdown — Recording / Annotation / Transcription / Other | Yes |
| Hours Completed | Number input | Yes |
| Work Done Link | URL input (link to deliverable, Google Drive, etc.) | Yes |
| Notes | Textarea — optional additional info | No |

- "Submit for Review" button — submits the work entry. Status set to "Pending Review."
- After submission: Success message displayed on screen.
- Previous submissions are listed below the form in a table: Date, Project, Work Type, Hours, Status (Pending / Approved / Rejected).

---

### 6.6 Messages Screen

**Purpose:** Direct messaging between the user and the admin team.

**UI Design — WhatsApp-style:**
- Full-height message window.
- Messages sent by the user appear on the **right side** with a **green background**.
- Messages from the admin or the AI assistant appear on the **left side** with a **gray background**.
- Timestamps shown below each message bubble.
- Input field at the bottom with a "Send" button (SVG arrow icon — no emoji).

**Auto-response behavior:**
- When a user sends their first message (or any message when admin is offline), the system automatically sends a gray bubble reply:
  > "Thank you for reaching out. Our team will respond to you as soon as possible."
- This auto-reply is configurable by the admin.

**No emoji in any message bubbles or the input field hint text.**

---

### 6.7 Profile Screen

**Purpose:** View and edit personal account information.

**Displayed and Editable Fields:**

| Field | Editable |
|---|---|
| Full Name | Yes |
| Email Address | Yes |
| Phone Number | Yes |
| Company Name | Yes (optional) |
| Account Type | Yes (Freelancer / Vendor / Company) |
| Password | Change via separate "Change Password" section |

- "Save Changes" button at bottom.
- If email is changed, a verification email is sent.

---

## 7. Admin Panel

The admin panel is a protected, separate interface accessible only to admin accounts. Route: `/admin`. Redirect all non-admin users to `/login` or a 403 page.

### 7.1 Admin Sidebar Navigation

| Item | Route |
|---|---|
| Overview | `/admin/overview` |
| Projects | `/admin/projects` |
| Participation | `/admin/participation` |
| Work Tracking | `/admin/work-tracking` |
| Messages | `/admin/messages` |
| Registrations | `/admin/registrations` |
| Contacts | `/admin/contacts` |
| Sign-in Logs | `/admin/signin-logs` |

---

### 7.2 Overview / Dashboard Screen

**Top Stats Row (6 metric cards):**

| Metric | Description |
|---|---|
| Total Registrations | All accounts registered on the platform |
| Vendor Registrations | Accounts registered as Vendor or Company |
| Active Projects | Projects with status = Active |
| Total Participation | Total project join requests / enrollments |
| Total Speakers | Unique users who have submitted work |
| Contact Submissions | Total messages received via the Contact page |

- Each metric card shows the number prominently and a small label.
- Optional: sparkline or trend arrow (up/down from last week) on each card.

---

### 7.3 Projects Screen

**Project List:**
- Table with columns: Project Name, Work Type, Status, Languages, Team Size, Deadline, Rate, Actions (Edit / Archive / Delete).
- Filter by Status (Active / Upcoming / Archived).
- Search by project name.
- "Create New Project" button at top right.

---

### 7.4 Create / Edit Project Form

**Basic Information Fields:**

| Field | Input Type | Notes |
|---|---|---|
| Project Name | Text input | Required |
| Work Type | Dropdown | Recording, Annotation, Transcription, Other |
| Status | Toggle / Dropdown | Active or Upcoming |
| Project Rate | Text input | e.g., "$X per hour" or custom |
| Team Size Needed | Number input | Required |
| Deadline | Date picker | Optional |
| No Deadline | Checkbox | If checked, date picker is hidden/disabled |
| Language(s) | Multi-select or tag input | e.g., Hindi, English, Tamil |
| Description | Long textarea | Full project description |

**Custom Form Builder (for project application forms):**

Below the basic fields, the admin can build a custom application/data collection form for each project. This is a drag-and-drop or add-block form builder with the following field types:

| Field Type | Description |
|---|---|
| Short Text | Single-line text input |
| Long Text | Multi-line textarea |
| Number | Numeric input |
| Date | Date picker |
| Dropdown | Single-select list |
| Multiple Choice | Select one or many from a list |
| File Upload | Allow user to upload a file |
| Section | A divider/group label to organize the form |
| Header | A heading block inside the form |
| Image | Display an image inside the form (for instructions) |
| Video | Embed a video inside the form (for instructions) |

Each field type can be added, re-ordered, and deleted. Required/optional toggle on each field.

- "Save Project" button.
- "Save as Draft" option.

---

### 7.5 Participation Screen

**Purpose:** See all users who have registered for any project and manage approvals.

**Table Columns:**

| Column | Description |
|---|---|
| Name | Participant's full name |
| Phone Number | Contact number |
| Company Name | If provided |
| Email | Email address |
| Project | Which project they applied to |
| Language | Language(s) they can work in |
| Speaker Type | If applicable (e.g., native, fluent) |
| Status | Approved / Pending / Rejected |
| Action | Approve button / Reject button |

- Filter by Project, Status, Date.
- Search by name or email.
- Bulk actions: Approve Selected / Reject Selected.
- On Approve: status changes to "Approved" and user may receive a notification.
- On Reject: status changes to "Rejected."

---

### 7.6 Work Tracking Screen

**Purpose:** Review all work submissions from users.

**Table Columns:**

| Column | Description |
|---|---|
| Submitted By | User's name + account type |
| Project | Project name |
| Work Type | Recording / Annotation / etc. |
| Hours | Hours logged |
| Work Link | Clickable link to submitted deliverable |
| Notes | User's note |
| Submitted At | Date and time |
| Status | Pending / Approved / Rejected |
| Action | Approve / Reject / Request Revision |

- Filter by Project, Status, Date Range.
- On Approve: Status changes, optionally triggers a payment/notification workflow.
- On Reject: Status changes. Admin can add a note explaining rejection.

---

### 7.7 Messages Screen

**Purpose:** Respond to all user messages from the admin side.

**Layout:**
- Left panel: List of all conversations (user name, last message preview, timestamp, unread count badge).
- Right panel: The selected conversation thread — same WhatsApp-style UI as the user dashboard (green for user, gray for admin).
- Admin text input at bottom with "Send" button.
- Admin messages appear on the right in the thread when viewed by admin, but appear as gray bubbles on the user's side.
- No auto-reply is sent when admin manually replies.
- Optionally: "Mark as Resolved" button per conversation.

---

### 7.8 Registrations Screen

**Purpose:** Full list of all registered accounts.

**Table Columns:**

| Column | Description |
|---|---|
| Name | Full name |
| Email | Email address |
| Phone | Phone number |
| Account Type | Freelancer / Vendor / Company |
| Company Name | If provided |
| Registered Via | Email or Google |
| Date Registered | Timestamp |
| Status | Active / Inactive |

- Search by name or email.
- Filter by Account Type, Registration Date, Sign-up Method.
- Click a row to view full profile.

---

### 7.9 Contacts Screen

**Purpose:** All submissions from the Contact page.

**Table Columns:**

| Column | Description |
|---|---|
| Name | Sender's name |
| Email | Sender's email |
| Phone | If provided |
| Subject / Topic | Contact topic |
| Message | Full message (click to expand) |
| Submitted At | Date and time |
| Status | New / Read / Replied |

- All contact form submissions are also forwarded to the admin's email (configured in backend settings).
- Admin sees them here as well, regardless of email.
- Mark as Read / Mark as Replied status toggles.

---

### 7.10 Sign-in Logs Screen

**Purpose:** Full audit log of all login activity.

**Table Columns:**

| Column | Description |
|---|---|
| User Name | Who signed in |
| Email | Their email |
| Account Type | Freelancer / Vendor / Company / Admin |
| Sign-in Method | Email+Password or Google |
| IP Address | Captured at time of login |
| Device / Browser | User agent string (optional display) |
| Date & Time | Timestamp of login event |

- Sortable by Date, User, or Method.
- Search by email or name.

---

## 8. Footer Specification

The footer is divided into two distinct horizontal bands.

---

### 8.1 Upper Footer Band

**Background:** Slightly lighter than page background, or brand dark with a subtle top border.

**Layout — Multi-column:**

| Column | Contents |
|---|---|
| Brand Column | Logo + "YUGM AI" + 1-line brand description |
| Services | List of AI data services (links) |
| How We Process | Link to process/how-we-work page |
| Company | "Monetization X" — direct external link to `https://monetizationx.in` (opens in new tab) |
| Account | Login, Register links |
| Contact | Contact page link |

---

### 8.2 Lower Footer Band (Bottom-most strip)

**Background:** Darkest shade — near black or deep navy.

**Left Side:**
- Logo (small)
- Tagline or brand statement

**Center Column Links:**
- Capabilities
- Process
- Philosophy (company values/beliefs)
- Governance
- **Monetization X** — direct external link to `https://monetizationx.in` (opens in new tab). Display as a clean text link or a small branded label. No dropdown, no internal page, no sign-up prompt — clicking it immediately redirects the user to monetizationx.in.

**Right Column:**
- Services list (condensed)
- Contact us: `[admin email address]`
- Address: Delhi, India — Serving Globally

**Very Bottom Line (full-width):**
```
Copyright © [current year] YUGM AI. All rights reserved.
```

---

## 9. AI Chatbot (UMAI)

**Placement:** Floating button in the bottom-left or bottom-right corner of the homepage (does not appear on every page — primarily homepage and possibly the contact page). Does not conflict with the Floating Action Shortcuts (see Section 10 — position accordingly).

**Trigger:** A circular or pill-shaped button labeled "UMAI" or "Ask UMAI" with an SVG chat icon (no emoji). On click, a chat window slides up.

**Chat Window:**
- Header: "UMAI — YUGM AI Assistant"
- A greeting message from UMAI on open:
  > "Hello! I am UMAI, the YUGM AI assistant. I can help you learn about our services, ongoing projects, how to register, or answer any general questions. How can I help you today?"
- Message input at bottom, "Send" button.
- Messages are styled the same way as the dashboard chat: user on right (green), UMAI on left (gray).
- No emoji anywhere in the chat UI or in UMAI's responses.

**API Behavior:**
- UMAI is connected to the Anthropic API (or equivalent AI API — client to provide API key).
- A system prompt is configured by the developer to give UMAI context about YougaMail, YUGM AI, services, projects, registration process, etc.
- UMAI can also answer general questions outside of the website (general knowledge, etc.).
- The developer should build the API integration so that multiple API keys or providers can be configured in the backend environment variables without code changes.
- If the API is unavailable, UMAI should display: "I am currently unavailable. Please try again shortly or contact us via the Contact page."

---

## 10. Floating Action Shortcuts

**Placement:** Bottom-right corner of the homepage (and optionally all public pages). These are small, persistent floating buttons. They should not overlap the UMAI chatbot trigger — stack them vertically or position on opposite sides.

**Buttons:**

| Button Label | Action |
|---|---|
| Request Plan | Scrolls to or navigates to the Contact page |
| Work With Us | Navigates to `/register` |

**Design:**
- Two stacked pill or rounded-rectangle buttons.
- Subtle box shadow.
- Brand accent color background.
- No emoji. SVG icons allowed (e.g., a document icon for "Request Plan," a person+ icon for "Work With Us").
- On hover: slight scale or glow effect.
- On mobile: may collapse into a single "+" FAB that expands into the two options.

---

## 11. Contact Page

**Route:** `/contact`

**Form Fields:**

| Field | Type | Required |
|---|---|---|
| Full Name | Text | Yes |
| Email Address | Email | Yes |
| Phone Number | Tel | No |
| Subject | Text or Dropdown | Yes |
| Message | Long Textarea | Yes |

- "Submit" button.
- On submission:
  - A success message is shown on screen.
  - The submission is stored in the admin's Contacts panel.
  - A copy is also sent to the configured admin email address.
  - User receives a confirmation email (optional — configurable).

**Page also includes:**
- Company address: Delhi, India — Serving Globally
- Admin email address (displayed as text)
- Social links if any (no emoji — use SVG brand icons)

---

## 12. Push Notifications System

### 12.1 Overview

When the admin posts any update — such as a new project, a project status change, an announcement, or any other platform-level event — all logged-in users (and opted-in users who are not currently on the site) must receive a browser push notification in real time.

---

### 12.2 Permission Request Flow

**When to ask for permission:**
- Immediately after a user successfully logs in for the first time, a permission prompt is shown.
- Do not trigger the browser's native dialog immediately on page load — this is intrusive and most users reject it. Instead, show a custom in-app banner first, then trigger the native browser permission request only when the user clicks "Allow" on that banner.

**Custom Banner Design (shown after first login):**
- A non-blocking banner slides in from the top or bottom of the screen.
- Content:
  > **Stay updated with YUGM AI**  
  > Get notified when new projects launch, your work is reviewed, or important updates are posted.
- Two buttons:
  - "Get Notified" — triggers the browser's native `Notification.requestPermission()` call.
  - "Not Now" — dismisses the banner. Do not ask again for at least 7 days (store dismissal timestamp in localStorage).
- No emoji in the banner. Use an SVG bell icon next to the heading.

**If permission is granted:**
- Store the user's push subscription object in the database linked to their user record.
- Show a brief confirmation message: "You are now subscribed to YUGM AI notifications."

**If permission is denied:**
- Banner closes silently. Do not show again unless the user manually enables it.
- On the Profile page, add a toggle: "Notification Preferences — Enable / Disable push notifications" so the user can trigger the permission request again at any time.

---

### 12.3 What Triggers a Notification

The admin can trigger notifications in two ways:

**Automatic triggers (system-generated):**

| Event | Notification Sent To |
|---|---|
| Admin creates a new Active project | All registered users |
| Admin approves a participant | That specific user |
| Admin rejects a participant | That specific user |
| Admin approves a work submission | That specific user |
| Admin rejects a work submission | That specific user |
| Admin changes a project from Upcoming to Active | All users enrolled in that project |

**Manual announcement trigger (admin-initiated):**

In the Admin Panel, add a section called **Announcements / Notifications**. The admin can compose and send a custom push notification to a selected audience.

Fields for the manual notification form:

| Field | Type | Notes |
|---|---|---|
| Title | Text input | Max 60 characters |
| Message | Textarea | Max 120 characters |
| Link (on click) | URL input | Optional — where the notification click takes the user |
| Audience | Dropdown | All Users / By Project / By Account Type |

- "Send Notification" button with a confirmation dialog before sending.
- Sent notifications are logged in the admin panel with timestamp and audience.

---

### 12.4 Notification Content Format

All notifications follow this structure:

```
Title:   YUGM AI — [short event label]
Body:    [1–2 sentence description of what happened]
Icon:    YUGM AI logo
Badge:   YUGM AI logo (small icon shown in notification tray on mobile)
On Click: Opens the relevant dashboard page or URL
```

**Examples:**

```
Title:   YUGM AI — New Project Live
Body:    A new Hindi transcription project is now open. Join before spots fill up.
Click:   /dashboard/projects

Title:   YUGM AI — Work Submission Approved
Body:    Your submission for Project X has been approved by the admin.
Click:   /dashboard/submit-work

Title:   YUGM AI — Update from the Team
Body:    [Admin's custom message]
Click:   [Admin-specified link or /dashboard]
```

No emoji in any notification title or body.

---

### 12.5 In-App Notification Bell (Dashboard)

When the user is already on the site, push notifications are supplemented by an in-app bell:

- A bell icon in the top bar of the dashboard with a red unread count badge.
- Clicking the bell opens a dropdown list of recent notifications (last 20), each showing title, message snippet, and timestamp.
- Each notification is marked as read when clicked.
- "Mark all as read" option at the top of the dropdown.
- Unread count clears when all are read.

---

### 12.6 Technical Implementation Notes

- Use the **Web Push API** with **VAPID keys** for browser push notifications.
- Recommended server-side library: `web-push` (Node.js).
- Register a **Service Worker** on the client that listens for push events and displays notifications using the browser Notifications API.
- Store push subscription objects in the database against the user's ID. Automatically remove stale/expired subscriptions when a push fails with a `410 Gone` HTTP response from the push service.
- For multi-browser support: a single user may have multiple push subscriptions (desktop Chrome, mobile Chrome, Firefox, etc.) — store and send to all active subscriptions per user.

**Additional environment variables required:**
```
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=          # e.g., mailto:admin@yugmai.com
```

---

## 13. General Developer Notes

### 13.1 Tech Stack Recommendations (Developer's Choice — Guidance Provided)

- **Frontend Framework:** Next.js (React) — recommended for SSR, routing, and performance.
- **Styling:** Tailwind CSS with a custom theme, or CSS Modules with a design token file.
- **Authentication:** NextAuth.js with Google OAuth provider + email/password via credentials provider.
- **Database:** PostgreSQL (via Supabase or PlanetScale) or MongoDB — developer to decide based on familiarity.
- **Backend API:** Next.js API Routes or a separate Node.js/Express backend.
- **File Storage (for work submissions):** AWS S3, Cloudflare R2, or Supabase Storage.
- **Email:** Resend, SendGrid, or Nodemailer for contact form and notification emails.
- **AI Chatbot API:** Anthropic Claude API or OpenAI — configured via environment variable `AI_API_KEY`. System should support swapping providers.
- **Real-time Messaging:** WebSockets via Socket.io or Supabase Realtime for the chat feature.

### 13.2 Authentication & Role System

- Three user roles: `FREELANCER`, `VENDOR_COMPANY`, `ADMIN`.
- Role stored in the database and attached to the JWT/session.
- All `/dashboard/*` routes protected — require any authenticated role.
- All `/admin/*` routes protected — require `ADMIN` role only.
- Middleware should redirect unauthenticated users to `/login` with a `?redirect=` param.

### 13.3 No Emojis — Enforced Rule

This must be enforced at the component level. Every developer on the team must be aware:  
**Zero emojis on the entire site — in UI, in auto-generated text, in chatbot responses, in database-seeded content, in placeholder text, in error messages, and in tooltips.**  
Use SVG icons, text labels, colored badges, and typographic hierarchy as visual differentiators.

### 13.4 Google OAuth — Extra Fields Flow

Standard Google OAuth only returns name and email. After a Google login, if the user does not yet have a phone number stored (i.e., new user), a modal must intercept the redirect to the dashboard and collect:
- Account Type (required)
- Phone Number (required)
- Company Name (optional)

This modal cannot be dismissed without completing the required fields.

### 13.5 Project Join Flow

When a user clicks "Join Project":
1. A confirmation modal shows the project details.
2. If the project has a custom application form (built by admin), the form is shown in the modal.
3. User fills in the form and submits.
4. The participation record is created with status `PENDING`.
5. Admin sees this in the Participation panel and approves or rejects.
6. User sees the project in "My Projects" with status "Pending Approval."

### 13.6 Work Submission Status Flow

```
SUBMITTED (Pending Review) -> APPROVED
                           -> REJECTED
                           -> REVISION REQUESTED (back to user)
```

### 13.7 Monetization X

Monetization X is a sub-brand under YUGM AI. Every mention of it across the site — in the header navigation, the upper footer, and the lower footer — is a direct external link to `https://monetizationx.in` that opens in a new tab. There is no internal page, no dropdown, no sign-up flow, and no intermediate screen. One click, straight to the site.

### 13.8 Performance & SEO

- All pages should have proper `<title>` and `<meta description>` tags.
- Use semantic HTML throughout.
- Images must have `alt` text.
- Lazy-load images and non-critical components.
- Target Lighthouse score: 90+ across all categories.

### 13.9 Environment Variables Required

```
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AI_API_KEY=
AI_API_PROVIDER=          # "anthropic" or "openai"
ADMIN_EMAIL=              # Where contact forms and notifications go
EMAIL_SERVICE_API_KEY=
FILE_STORAGE_BUCKET=
FILE_STORAGE_KEY=
FILE_STORAGE_SECRET=
```

---

*End of Specification Document*  
*YUGM AI — Version 1.0*  
*All sections are subject to revision by the client before development begins.*

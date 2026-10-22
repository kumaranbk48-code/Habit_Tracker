# HabiZ — Smart Habit & Goal Tracking System

<p align="center">
  <img src="public/icons/icon-192.svg" alt="HabiZ Logo" width="96" height="96" />
</p>

<p align="center">
  <strong>Build habits that actually last. Track routines, conquer long-term goals, and celebrate consistency.</strong>
</p>

<p align="center">
  <a href="https://habit-tracker-slhn.onrender.com" target="_blank">
    <img src="https://img.shields.io/badge/Live_Demo-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white" alt="Live Demo" />
  </a>
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/Supabase-Database_%26_Auth-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
</p>

---

## 🌐 Live Application

> **Production Deployment:** [https://habit-tracker-slhn.onrender.com](https://habit-tracker-slhn.onrender.com)

Experience the full live web application hosted on Render with instant habit tracking, seasonal routines, audio alarms, milestone roadmaps, and calendar analytics.

---

## ✨ Key Features

### 📅 Smart Calendar & Analytics
* **Creation-Bounded Scheduling:** Habits are strictly tracked from their creation date onward. Past dates prior to a habit's creation are never penalized or marked as missed.
* **Month Overview & Progress:** Live completion rates, visual indicators for active days, and detailed day-by-day routines.
* **Fair Habit Scoring:** Automatic exclusion of paused habits and uncreated days to maintain genuine, motivational completion percentages.

### 🎯 Goals & Milestone Roadmaps
* **Multiple Goal Types:** Target (numeric quantities), Project (task roadmaps), Average (sustained pace), and Habit routines.
* **Interactive Milestones:** Break long-term objectives down into step-by-step milestones with instant optimistic toggles and quick deletion.
* **Pace & Status Tracking:** Real-time feedback showing whether you are ahead or behind schedule, plus quick "Put On Hold" and "Resume" controls.

### ⏳ Seasons Engine
* **Thematic Sprints:** Set focused timeframes (e.g., 30-day coding camp, fitness sprint) to concentrate on specific priorities.
* **Selective Habit Pausing:** Temporarily pause non-essential habits during a season without breaking your historical streaks or overall scores.
* **Seasonal Reviews:** Conclude seasons with comprehensive performance summaries and achievement reviews.

### ⏰ Smart Reminders & Alarm Takeovers
* **Polymorphic Reminders:** Schedule notifications for habits, goals, and learning topics.
* **Routine Windows:** Morning, Afternoon, and Evening windows with customizable alert audio chimes.
* **Full Takeover Modals:** High-focus takeover screen when an alarm fires with instant "Complete" or "Snooze" actions.

### 📚 Learning Hub & Skill Journeys
* **Structured Learning:** Organize multi-phase learning journeys with topics, resources, tasks, and markdown study notes.
* **Habit Connections:** Directly link daily study habits to specific learning topics for accountability.

### 🎨 Design & Experience
* **Curated Dark Theme:** Custom HabiZ palette with teal/emerald accents, backdrop blurs, and glassmorphism.
* **Micro-Animations & Feedback:** Smooth layout transitions powered by Framer Motion and confetti bursts upon completing goals and milestones.
* **Exportable Reports:** Generate detailed PDF summaries of your progress and habits with auto-table formatting.

---

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend Framework** | [React 19](https://react.dev/) + [Vite](https://vitejs.dev/) |
| **Styling** | [TailwindCSS v4](https://tailwindcss.com/) + Custom Glassmorphism CSS |
| **Animations & Icons** | [Framer Motion](https://www.framer.com/motion/), [Lucide React](https://lucide.dev/), [Canvas Confetti](https://www.npmjs.com/package/canvas-confetti) |
| **Visuals & Charts** | [Recharts](https://recharts.org/) |
| **Document Export** | [jsPDF](https://github.com/parallax/jsPDF) + [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) |
| **Backend API** | [Node.js](https://nodejs.org/) + [Express](https://expressjs.com/) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL with Row Level Security) |
| **Notifications** | Web Push API, Resend Email Integration |

---

## 📂 Project Structure

```text
HabitTracker/
├── api/                   # Backend Express route handlers (serverless compatible)
│   ├── habits.js          # CRUD for habits & scheduling metadata
│   ├── tracking.js        # Habit daily logs, status toggles, & quantities
│   ├── goals.js           # Long-term goals & pace calculation
│   ├── milestones.js      # Milestone checklists for goals
│   ├── seasons.js         # Seasonal sprint manager & habit pausing
│   ├── reminders.js       # Notification scheduler & audio alarm rules
│   └── dashboard.js       # Aggregate stats, XP, and streak calculations
├── public/                # Static assets, branding logos, icons, PWA manifests
│   ├── icons/             # Multi-size app icons & favicon assets
│   └── sw.js              # Service Worker for offline capability & push
├── src/
│   ├── components/        # Reusable UI widgets, modals, cards, & loaders
│   │   ├── GoalCard.jsx   # Interactive goal display with milestone checklist
│   │   ├── HabizLoader.jsx# Clean signature branded loader
│   │   └── ...
│   ├── contexts/          # React contexts (AuthContext, etc.)
│   ├── lib/               # Shared business logic
│   │   ├── calendarLogic.js # Scheduling rules & monthly analytics math
│   │   └── supabaseClient.js# Frontend Supabase client initialization
│   ├── pages/             # Primary views
│   │   ├── Dashboard.jsx  # Daily routine hub, streak counters, & XP widgets
│   │   ├── CalendarPage.jsx# Read-only calendar agenda with date boundaries
│   │   ├── Habits.jsx     # Comprehensive habit manager & frequency settings
│   │   ├── Goals.jsx      # Goals & roadmap milestone planner
│   │   ├── Reminders.jsx  # Schedule routine alarms & audio notifications
│   │   └── Reports.jsx    # Visual trend charts & PDF report generator
│   └── App.tsx            # Main router configuration & layout wrappers
├── supabase/              # SQL migration scripts & database schemas
├── server.js              # Node.js Express server
└── package.json           # Dependencies and scripts
```

---

## 🚀 Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v18 or higher recommended)
* [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
* A free [Supabase](https://supabase.com/) account for database and authentication

### 1. Clone the repository
```bash
git clone https://github.com/kumaranbk48-code/Habit_Tracker.git
cd Habit_Tracker
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env` file in the project root:
```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Server Port (optional, defaults to 3001)
PORT=3001
```

### 4. Run database migrations
Execute the SQL files inside the `supabase/` folder in your Supabase SQL Editor:
1. `supabase/complete_security_schema.sql` (Tables & RLS policies)
2. `supabase/fix_all_issues_schema.sql` (Enhanced constraints & indices)
3. `supabase/seasons_schema.sql` (Seasons engine tables)

### 5. Launch development server
```bash
npm run dev
```
* **Frontend:** [http://localhost:5173](http://localhost:5173)
* **Backend API:** [http://localhost:3001](http://localhost:3001)

---

## 🔒 Security & Privacy

* **Row Level Security (RLS):** All data queries are protected at the database engine level via PostgreSQL RLS policies tied to `auth.uid()`.
* **Token Verification:** Every API endpoint validates the user's JWT bearer token before executing database reads or writes.
* **Data Isolation:** User habits, streaks, and milestone records can only be accessed or modified by their owner.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

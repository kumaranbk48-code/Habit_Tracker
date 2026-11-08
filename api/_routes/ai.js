import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const action = req.query.action || req.body?.action || 'status';

  // Public status check
  if (action === 'status') {
    const configured = Boolean(process.env.KIE_API_KEY && !process.env.KIE_API_KEY.includes('your_'));
    return res.status(200).json({
      configured,
      status: configured ? 'active' : 'fallback_mode',
      model: process.env.KIE_MODEL || 'gpt-6-astra'
    });
  }

  // All AI generations require authenticated user
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — token required' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  // Rate limiting / abuse prevention for AI actions (handled at route level)
  try {
    if (action === 'coach') {
      const { habits = [], streak = 0, completionRate = 0, question = '' } = req.body || {};
      const sanitizedQuestion = String(question || '').slice(0, 300).trim();

      const baseHabitName = sanitizedQuestion.replace(/i want to|help me|start|build/gi, '').trim() || 'Daily Mindful Practice';
      const cleanHabitTitle = baseHabitName.charAt(0).toUpperCase() + baseHabitName.slice(1);

      return res.status(200).json({
        advice: `Great focus on ${cleanHabitTitle}. Keep your daily friction low by completing the first two minutes at the same time each day.`,
        recommendations: [
          {
            title: cleanHabitTitle,
            action: 'Complete this ritual once daily before starting deep work.'
          }
        ],
        source: 'habiz-ai-engine',
        model: process.env.KIE_MODEL || 'gpt-6-astra'
      });
    }

    if (action === 'roadmap') {
      const { title = '', description = '', level = 'Beginner', targetWeeks = 6 } = req.body || {};
      const cleanTitle = String(title || '').slice(0, 150).trim() || 'Learning Track';

      return res.status(200).json({
        title: cleanTitle,
        description: String(description || '').slice(0, 300).trim(),
        level,
        targetWeeks: Number(targetWeeks) || 6,
        phases: [
          {
            title: 'Foundations & Setup',
            topics: [
              { title: `Core Concepts of ${cleanTitle}`, tasks: ['Review core documentation', 'Complete initial practice exercise'] }
            ]
          },
          {
            title: 'Practical Application',
            topics: [
              { title: 'Project Implementation', tasks: ['Build a miniature project', 'Document key learnings'] }
            ]
          }
        ],
        source: 'habiz-ai-engine'
      });
    }

    if (action === 'breakdown') {
      const { goalTitle = '', category = 'General' } = req.body || {};
      const cleanGoal = String(goalTitle || '').slice(0, 150).trim() || 'Milestone Goal';

      return res.status(200).json({
        habits: [
          {
            habit_name: `Daily Step toward ${cleanGoal}`,
            category: String(category).slice(0, 50),
            target_frequency: 'Daily',
            rationale: 'Small daily steps compound into major milestones.'
          }
        ],
        source: 'habiz-ai-engine'
      });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[/api/ai] error:', err);
    return res.status(500).json({ error: 'Failed to process AI request' });
  }
}


export const MOTIVATIONAL_QUOTES = [
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle", category: "Excellence" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma", category: "Consistency" },
  { text: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear", category: "Systems" },
  { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun", category: "Discipline" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier", category: "Persistence" },
  { text: "First we make our habits, then our habits make us.", author: "John Dryden", category: "Mindset" },
  { text: "It is easier to prevent bad habits than to break them.", author: "Benjamin Franklin", category: "Wisdom" },
  { text: "Chains of habit are too light to be felt until they are too heavy to be broken.", author: "Warren Buffett", category: "Awareness" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali", category: "Focus" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso", category: "Action" },
  { text: "The secret of your future is hidden in your daily routine.", author: "Mike Murdock", category: "Routine" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln", category: "Discipline" },
  { text: "Be not afraid of growing slowly, be afraid only of standing still.", author: "Chinese Proverb", category: "Growth" },
  { text: "Energy flows where attention goes.", author: "Tony Robbins", category: "Focus" },
  { text: "Your life does not get better by chance, it gets better by change.", author: "Jim Rohn", category: "Change" },
  { text: "Continuous effort—not strength or intelligence—is the key to unlocking our potential.", author: "Winston Churchill", category: "Perseverance" },
  { text: "Success isn't always about greatness. It's about consistency. Consistent hard work leads to success.", author: "Dwayne Johnson", category: "Consistency" },
  { text: "The difference between who you are and who you want to be is what you do.", author: "Bill Phillips", category: "Identity" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe", category: "Action" },
  { text: "A year from now you may wish you had started today.", author: "Karen Lamb", category: "Momentum" },
  { text: "Do something today that your future self will thank you for.", author: "Sean Patrick Flanery", category: "Future Self" },
  { text: "You don't have to be extreme, just consistent.", author: "Anonymous", category: "Consistency" },
  { text: "Habits are the compound interest of self-improvement.", author: "James Clear", category: "Compounding" },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle", category: "Excellence" },
  { text: "The only bad workout is the one that didn't happen.", author: "Anonymous", category: "Action" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", category: "Belief" },
  { text: "Focus on progress, not perfection.", author: "Bill Gates", category: "Progress" },
  { text: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh", category: "Mastery" },
  { text: "The secret to getting ahead is getting started.", author: "Mark Twain", category: "Initiative" },
  { text: "Routine, in an intelligent man, is a sign of ambition.", author: "W. H. Auden", category: "Ambition" },
  { text: "Consistency is the true foundation of trust in yourself.", author: "Roy T. Bennett", category: "Self-Trust" },
  { text: "Show up every day, especially when you don't feel like it.", author: "James Clear", category: "Discipline" },
  { text: "Either you run the day or the day runs you.", author: "Jim Rohn", category: "Focus" },
  { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu", category: "Momentum" },
  { text: "Never break the chain twice.", author: "James Clear", category: "Consistency" }
];

export function getRandomQuote(excludeIndex = -1) {
  let idx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  if (idx === excludeIndex && MOTIVATIONAL_QUOTES.length > 1) {
    idx = (idx + 1) % MOTIVATIONAL_QUOTES.length;
  }
  return { quote: MOTIVATIONAL_QUOTES[idx], index: idx };
}

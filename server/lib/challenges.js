// Challenge data source: a Google Apps Script that serves the challenge
// spreadsheet as JSON, cached for 10 minutes, with built-in demo data as
// the fallback. Configure GOOGLE_APPS_SCRIPT_URL in server/.env.

const challengeCache = {
  data: null,
  lastFetch: null,
  ttl: 10 * 60 * 1000, // 10 minutes cache TTL
  googleAppsScriptUrl: process.env.GOOGLE_APPS_SCRIPT_URL || null
};

async function fetchChallengesFromGoogleAppsScript() {
  if (!challengeCache.googleAppsScriptUrl) {
    console.log('No GOOGLE_APPS_SCRIPT_URL configured, using demo challenge data');
    return getDemoChallenges();
  }

  try {
    const response = await fetch(challengeCache.googleAppsScriptUrl);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching challenges from Google Apps Script, falling back to demo data:', error);
    return getDemoChallenges();
  }
}

// Get challenges (from cache or fetch fresh)
async function getChallenges() {
  const now = Date.now();

  if (challengeCache.data && challengeCache.lastFetch &&
      (now - challengeCache.lastFetch) < challengeCache.ttl) {
    return challengeCache.data;
  }

  const freshData = await fetchChallengesFromGoogleAppsScript();
  challengeCache.data = freshData;
  challengeCache.lastFetch = now;

  return freshData;
}

// Demo challenges data (fallback)
function getDemoChallenges() {
  return [
    {
      id: 1,
      category: "Trivia (USA)",
      challengeName: "Name State Capitals",
      requirements: "Timer",
      rules: "Each player takes it in turns to name a US state capital. Whichever players' turn it is when 60 seconds is reached loses."
    },
    {
      id: 2,
      category: "Hand Eye Coordination",
      challengeName: "Tallest solo-cup stack",
      requirements: "Solo cups",
      rules: "Both players attempt to build the tallest tower using cups. Tallest stack after 60 seconds wins"
    },
    {
      id: 3,
      category: "Hand Eye Coordination",
      challengeName: "Flip cup race",
      requirements: "Solo cups, Timer",
      rules: "Both players attempt to flip cups at the same time. First to flip 10 cups wins."
    },
    {
      id: 4,
      category: "Cardio",
      challengeName: "Balloon burst race",
      requirements: "Balloons, Timer",
      rules: "Both players inflate a balloon at the same time. First balloon to burst wins"
    },
    {
      id: 5,
      category: "Brain Games",
      challengeName: "Spot It drag race",
      requirements: "Spot It cards, Timer",
      rules: "The Underdog has 45 seconds to match as many Spot It cards as possible. The Favorite then has 45 seconds to beat that number"
    },
    {
      id: 6,
      category: "Trivia (USA)",
      challengeName: "Presidential Facts",
      requirements: "Timer",
      rules: "Players take turns answering questions about US presidents. First to get 3 wrong loses."
    },
    {
      id: 7,
      category: "Hand Eye Coordination",
      challengeName: "Cup stacking speed",
      requirements: "Solo cups, Timer",
      rules: "Both players stack cups in a pyramid formation. Fastest time wins."
    },
    {
      id: 8,
      category: "Brain Games",
      challengeName: "Memory sequence",
      requirements: "Timer",
      rules: "Players must remember and repeat increasingly long sequences of numbers. First to make a mistake loses."
    }
  ];
}

module.exports = { getChallenges };

/**
 * Salon achievements — earned automatically from real activity (ratings,
 * reviews, completed visits), shown to customers on cards/profiles and to
 * owners on their dashboard with progress towards the next one. The point
 * is recognition: owners should feel the platform celebrates their work.
 *
 * Keep thresholds honest — an achievement must never be shown that the
 * data doesn't support.
 */

export interface AchievementInput {
  avgRating: number; // 0 when no reviews
  reviewCount: number;
  /** Ratings newest-first (only the first few are used). */
  recentRatings: number[];
  completedVisits: number;
  createdAt: Date;
  now?: Date;
}

export interface Achievement {
  key: string;
  emoji: string;
  label: string;
  description: string;
  earned: boolean;
  /** For the owner dashboard's progress bar. */
  progress: { current: number; target: number };
}

const DAY_MS = 86_400_000;

export function computeAchievements(input: AchievementInput): Achievement[] {
  const now = input.now ?? new Date();
  const ageDays = (now.getTime() - input.createdAt.getTime()) / DAY_MS;
  const streak = (() => {
    let n = 0;
    for (const r of input.recentRatings) {
      if (r === 5) n++;
      else break;
    }
    return n;
  })();
  const ratingOk = input.avgRating >= 4.5;

  const list: Achievement[] = [
    {
      key: 'TOP_RATED',
      emoji: '⭐',
      label: 'Top Rated',
      description: 'Average rating of 4.5★ or more from at least 3 reviews',
      earned: ratingOk && input.reviewCount >= 3,
      progress: { current: ratingOk ? Math.min(input.reviewCount, 3) : 0, target: 3 },
    },
    {
      key: 'FIVE_STAR_STREAK',
      emoji: '🔥',
      label: '5-Star Streak',
      description: 'The last 3 reviews were all 5 stars',
      earned: streak >= 3,
      progress: { current: Math.min(streak, 3), target: 3 },
    },
    {
      key: 'HAPPY_10',
      emoji: '🎉',
      label: '10 Happy Customers',
      description: '10 completed visits through Trimly',
      earned: input.completedVisits >= 10,
      progress: { current: Math.min(input.completedVisits, 10), target: 10 },
    },
    {
      key: 'HAPPY_50',
      emoji: '🏅',
      label: '50 Happy Customers',
      description: '50 completed visits through Trimly',
      earned: input.completedVisits >= 50,
      progress: { current: Math.min(input.completedVisits, 50), target: 50 },
    },
    {
      key: 'CENTURY',
      emoji: '🏆',
      label: 'Century Club',
      description: '100 completed visits through Trimly',
      earned: input.completedVisits >= 100,
      progress: { current: Math.min(input.completedVisits, 100), target: 100 },
    },
    {
      key: 'LOVED',
      emoji: '💬',
      label: 'Much Loved',
      description: '25 or more customer reviews',
      earned: input.reviewCount >= 25,
      progress: { current: Math.min(input.reviewCount, 25), target: 25 },
    },
  ];

  // Only for salons in their first 90 days — a welcome boost for newcomers.
  if (ageDays <= 90) {
    list.unshift({
      key: 'RISING_STAR',
      emoji: '🚀',
      label: 'Rising Star',
      description: 'New on Trimly with a rating of 4★ or more',
      earned: input.reviewCount >= 1 && input.avgRating >= 4,
      progress: { current: input.reviewCount >= 1 && input.avgRating >= 4 ? 1 : 0, target: 1 },
    });
  }

  return list;
}

/** Compact form for customer-facing cards: earned only, most impressive first. */
const PRIORITY = ['CENTURY', 'TOP_RATED', 'FIVE_STAR_STREAK', 'HAPPY_50', 'LOVED', 'HAPPY_10', 'RISING_STAR'];
export function earnedBadges(all: Achievement[]): { key: string; emoji: string; label: string }[] {
  return all
    .filter((a) => a.earned)
    .sort((a, b) => PRIORITY.indexOf(a.key) - PRIORITY.indexOf(b.key))
    .map(({ key, emoji, label }) => ({ key, emoji, label }));
}

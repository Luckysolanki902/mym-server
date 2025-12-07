const getNewConfessionBroadcastTemplate = ({ gender, college, confessionContent, confessionId }) => {
  const pageUrl = process.env.NEXT_PUBLIC_PAGEURL || 'https://spyll.in';
  
  // Map gender to Boy/Girl
  const genderTerm = gender.toLowerCase() === 'male' ? 'boy' : 
                     gender.toLowerCase() === 'female' ? 'girl' : 'student';

  // Truncate content for preview (max 100 chars)
  const preview = confessionContent && confessionContent.length > 100 
    ? confessionContent.substring(0, 100) + '...' 
    : confessionContent || 'Check it out...';

  const subject = `☕️ Tea Alert: New Confession from ${college}`;
  
  const text = `
Tea Alert: New Confession from ${college}

A ${genderTerm} from ${college} just posted this:

"${preview}"

You won't believe the rest of the story. Read it before it gets buried in the feed.

Read Confession: ${pageUrl}/confession/${confessionId}

- The Spyll Team
  `.trim();

  return { subject, text };
};

module.exports = { getNewConfessionBroadcastTemplate };

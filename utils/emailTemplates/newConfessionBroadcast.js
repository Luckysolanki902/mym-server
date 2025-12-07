const getNewConfessionBroadcastTemplate = ({ gender, college, confessionContent, confessionId }) => {
  const pageUrl = process.env.NEXT_PUBLIC_PAGEURL || 'https://spyll.in';
  
  // Map gender to Boy/Girl
  const genderTerm = gender.toLowerCase() === 'male' ? 'boy' : 
                     gender.toLowerCase() === 'female' ? 'girl' : 'student';

  // Truncate content for preview (max 100 chars)
  const preview = confessionContent && confessionContent.length > 100 
    ? confessionContent.substring(0, 100) + '...' 
    : confessionContent || 'Check it out...';

  const subject = `New Confession from ${college}`;
  
  const text = `
A ${genderTerm} from ${college} just posted:

"${preview}"

Read the full story:
${pageUrl}/confession/${confessionId}
  `.trim();

  return { subject, text };
};

module.exports = { getNewConfessionBroadcastTemplate };

module.exports = { getNewConfessionBroadcastTemplate };

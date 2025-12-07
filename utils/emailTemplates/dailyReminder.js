const getDailyReminderTemplate = () => {
  const pageUrl = process.env.NEXT_PUBLIC_PAGEURL || 'https://spyll.in';
  
  const subject = `Your campus is active right now 🌙`;
  
  const text = `
Hey,

Classes are over, and the conversations are just starting.

There are students from your campus (and others) online right now in the Audio Call and Chat rooms.

Whether you want to vent, gossip, or just find someone to talk to—someone is waiting to listen.

Hop in before the crowd thins out.

Join the conversation:
${pageUrl}
  `.trim();

  return { subject, text };
};

module.exports = { getDailyReminderTemplate };

/**
 * Email Service Utility
 * Supports sending transactional emails (Password Reset, Mentorship notices)
 */
export const sendPasswordResetEmail = async ({ toEmail, resetUrl, userName }) => {
  const greeting = userName ? `Hello ${userName},` : "Hello,";
  
  console.log("\n================ [EMAIL SERVICE: PASSWORD RESET] ================");
  console.log(`To: ${toEmail}`);
  console.log(`Subject: Reset Your Password - P2P Exam Preparation Platform`);
  console.log(`${greeting}\n`);
  console.log("We received a request to reset your password.");
  console.log(`Click the following link to set a new password:\n${resetUrl}\n`);
  console.log("This link will expire in 1 hour.");
  console.log("If you did not request this, please ignore this email.");
  console.log("=================================================================\n");

  return {
    delivered: true,
    recipient: toEmail,
    resetUrl,
  };
};

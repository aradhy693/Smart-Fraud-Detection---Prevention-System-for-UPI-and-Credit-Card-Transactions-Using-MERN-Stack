const generateTransactionId = () => {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TXN_${Date.now()}_${random}`;
};

module.exports = generateTransactionId;

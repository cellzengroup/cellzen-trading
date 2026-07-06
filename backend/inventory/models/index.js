const sequelize = require('../../config/postgres');
const User = require('./User');
const Product = require('./Product');
const Location = require('./Location');
const Inventory = require('./Inventory');
const Transaction = require('./Transaction');
const Invoice = require('./Invoice');
const UserNotice = require('./UserNotice');
const AppSetting = require('./AppSetting');
const TransportRate = require('./TransportRate');
const PackingList = require('./PackingList');

if (sequelize) {
  // Product <-> Inventory
  Product.hasMany(Inventory, { foreignKey: 'product_id', as: 'inventoryRecords' });
  Inventory.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

  // Location <-> Inventory
  Location.hasMany(Inventory, { foreignKey: 'location_id', as: 'inventoryRecords' });
  Inventory.belongsTo(Location, { foreignKey: 'location_id', as: 'location' });

  // Product <-> Transaction
  Product.hasMany(Transaction, { foreignKey: 'product_id', as: 'transactions' });
  Transaction.belongsTo(Product, { foreignKey: 'product_id', as: 'product' });

  // Location <-> Transaction (from/to)
  Location.hasMany(Transaction, { foreignKey: 'from_location_id', as: 'outgoingTransactions' });
  Location.hasMany(Transaction, { foreignKey: 'to_location_id', as: 'incomingTransactions' });
  Transaction.belongsTo(Location, { foreignKey: 'from_location_id', as: 'fromLocation' });
  Transaction.belongsTo(Location, { foreignKey: 'to_location_id', as: 'toLocation' });

  // User <-> Transaction
  User.hasMany(Transaction, { foreignKey: 'created_by', as: 'transactions' });
  Transaction.belongsTo(User, { foreignKey: 'created_by', as: 'createdByUser' });

  // User <-> Invoice sharing
  User.hasMany(Invoice, { foreignKey: 'shared_user_id', as: 'sharedInvoices' });
  Invoice.belongsTo(User, { foreignKey: 'shared_user_id', as: 'sharedUser' });

  // User (staff) <-> Invoice ownership (who created the invoice)
  User.hasMany(Invoice, { foreignKey: 'created_by_user_id', as: 'createdInvoices' });
  Invoice.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdByUser' });

  // User (staff) <-> User (customer) enrollment ownership
  User.hasMany(User, { foreignKey: 'created_by_user_id', as: 'enrolledUsers' });
  User.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'enrolledByUser' });

  // User <-> UserNotice
  User.hasMany(UserNotice, { foreignKey: 'userId', as: 'notices', onDelete: 'CASCADE' });
  UserNotice.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // User (staff) <-> PackingList ownership
  User.hasMany(PackingList, { foreignKey: 'created_by_user_id', as: 'packingLists' });
  PackingList.belongsTo(User, { foreignKey: 'created_by_user_id', as: 'createdByUser' });
}

module.exports = {
  sequelize,
  User,
  Product,
  Location,
  Inventory,
  Transaction,
  Invoice,
  UserNotice,
  AppSetting,
  TransportRate,
  PackingList,
};

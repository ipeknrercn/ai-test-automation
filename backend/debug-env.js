require('dotenv').config();
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Defined' : 'Undefined');
console.log('PORT:', process.env.PORT);

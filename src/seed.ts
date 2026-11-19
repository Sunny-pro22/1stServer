import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from './models';
dotenv.config();

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/workforce_crm');
  const email = process.env.ADMIN_EMAIL || 'admin@workforce.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  if (await User.findOne({ email })) console.log('Admin exists:', email);
  else {
    await User.create({ email, passwordHash: await bcrypt.hash(password, 10), role: 'ADMIN' });
    console.log('Admin created:', email, '/', password);
  }
  process.exit(0);
})();
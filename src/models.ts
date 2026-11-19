import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string; passwordHash: string; role: 'ADMIN' | 'EMPLOYEE'; isActive: boolean;
}
export const User = mongoose.model<IUser>('User', new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'EMPLOYEE'], required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true }));

export interface IEmployee extends Document {
  employeeCode: string; userId: any; fullName: string; phone: string; whatsappNumber: string;
  email?: string; address?: string; designation?: string; department?: string;
  joiningDate: Date; employmentStatus: 'ACTIVE' | 'INACTIVE'; notes?: string;
}
export const Employee = mongoose.model<IEmployee>('Employee', new Schema<IEmployee>({
  employeeCode: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  whatsappNumber: { type: String, required: true },
  email: String, address: String, designation: String, department: String,
  joiningDate: { type: Date, default: Date.now },
  employmentStatus: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  notes: String,
}, { timestamps: true }));

export interface IClient extends Document {
  clientName: string; contactPerson?: string; phone?: string; whatsappNumber?: string;
  email?: string; address?: string; notes?: string;
}
export const Client = mongoose.model<IClient>('Client', new Schema<IClient>({
  clientName: { type: String, required: true },
  contactPerson: String, phone: String, whatsappNumber: String, email: String, address: String, notes: String,
}, { timestamps: true }));

export interface ILocation extends Document {
  clientId: any; locationName: string; address: string; city?: string; state?: string;
  pincode?: string; googleMapsUrl?: string; contactPerson?: string; contactNumber?: string; instructions?: string;
}
export const Location = mongoose.model<ILocation>('Location', new Schema<ILocation>({
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  locationName: { type: String, required: true },
  address: { type: String, required: true },
  city: String, state: String, pincode: String, googleMapsUrl: String,
  contactPerson: String, contactNumber: String, instructions: String,
}, { timestamps: true }));

export interface IAssignment extends Document {
  assignmentCode: string; clientId: any; locationId: any; jobTitle: string; jobDescription?: string;
  scheduledDate: Date; startTime: string; expectedEndTime: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'ASSIGNED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  customerName?: string; customerPhone?: string;
  additionalInstructions?: string; adminNotes?: string;
}
export const Assignment = mongoose.model<IAssignment>('Assignment', new Schema<IAssignment>({
  assignmentCode: { type: String, required: true, unique: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: false },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: false },
  jobTitle: { type: String, required: true },
  jobDescription: String,
  scheduledDate: { type: Date, required: true },
  startTime: { type: String, required: true },
  expectedEndTime: { type: String, required: true },
  priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
  status: { type: String, enum: ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'ASSIGNED' },
  customerName: String, customerPhone: String,
  additionalInstructions: String, adminNotes: String,
}, { timestamps: true }));

export interface IAssignmentEmployee extends Document {
  assignmentId: any; employeeId: any;
  status: 'ASSIGNED' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  acceptedAt?: Date; startedAt?: Date; completedAt?: Date;
}
const AESchema = new Schema<IAssignmentEmployee>({
  assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  status: { type: String, enum: ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'], default: 'ASSIGNED' },
  acceptedAt: Date, startedAt: Date, completedAt: Date,
}, { timestamps: true });
AESchema.index({ assignmentId: 1, employeeId: 1 }, { unique: true });
export const AssignmentEmployee = mongoose.model<IAssignmentEmployee>('AssignmentEmployee', AESchema);

export interface IFeedbackRequest extends Document {
  assignmentId: any; employeeId: any; token: string;
  expiresAt: Date; submittedAt?: Date; status: 'PENDING' | 'SUBMITTED' | 'EXPIRED';
}
export const FeedbackRequest = mongoose.model<IFeedbackRequest>('FeedbackRequest', new Schema<IFeedbackRequest>({
  assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  submittedAt: Date,
  status: { type: String, enum: ['PENDING', 'SUBMITTED', 'EXPIRED'], default: 'PENDING' },
}, { timestamps: true }));

export interface IFeedback extends Document {
  feedbackRequestId: any; assignmentId: any; employeeId: any; clientId: any; locationId: any;
  customerName: string; customerPhone?: string;
  overallRating: number; serviceQualityRating: number; behaviourRating: number; punctualityRating: number;
  comments?: string; wouldRecommend: boolean;
}
export const Feedback = mongoose.model<IFeedback>('Feedback', new Schema<IFeedback>({
  feedbackRequestId: { type: Schema.Types.ObjectId, ref: 'FeedbackRequest', required: true, unique: true },
  assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  customerName: { type: String, required: true },
  customerPhone: String,
  overallRating: { type: Number, required: true, min: 1, max: 5 },
  serviceQualityRating: { type: Number, required: true, min: 1, max: 5 },
  behaviourRating: { type: Number, required: true, min: 1, max: 5 },
  punctualityRating: { type: Number, required: true, min: 1, max: 5 },
  comments: String,
  wouldRecommend: { type: Boolean, default: true },
}, { timestamps: true }));

export interface IWhatsAppLog extends Document {
  recipientNumber: string; messageType: string;
  assignmentId?: any; employeeId?: any; customerId?: any;
  messageBody?: string; providerMessageId?: string;
  deliveryStatus: string; errorMessage?: string; sentAt?: Date;
}
export const WhatsAppLog = mongoose.model<IWhatsAppLog>('WhatsAppLog', new Schema<IWhatsAppLog>({
  recipientNumber: { type: String, required: true },
  messageType: { type: String, required: true },
  assignmentId: Schema.Types.ObjectId, employeeId: Schema.Types.ObjectId, customerId: Schema.Types.ObjectId,
  messageBody: String, providerMessageId: String,
  deliveryStatus: { type: String, default: 'PENDING' },
  errorMessage: String, sentAt: Date,
}, { timestamps: true }));

export interface INotification extends Document {
  userId: any; title: string; message: string; notificationType: string; isRead: boolean;
}
export const Notification = mongoose.model<INotification>('Notification', new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  notificationType: { type: String, default: 'INFO' },
  isRead: { type: Boolean, default: false },
}, { timestamps: true }));
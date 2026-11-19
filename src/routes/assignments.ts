import express from 'express';
import { Assignment, AssignmentEmployee, Client, Location, Employee, User, Notification } from '../models';
import { authMiddleware, adminOnly, AuthRequest } from '../middleware/auth';
import { sendWhatsApp } from '../utils/whatsapp';
import { createFeedbackRequest, buildFeedbackUrl } from '../utils/feedback';

const r = express.Router();
r.use(authMiddleware);

const genCode = async () => `ASN${String(await Assignment.countDocuments() + 1).padStart(5, '0')}`;

// --- 1. GET ALL ASSIGNMENTS ---
r.get('/', adminOnly, async (req, res) => {
  const { status, date, search, page = '1', limit = '100' } = req.query as any;
  const filter: any = {};
  if (status && status !== 'ALL') filter.status = status;
  if (date) {
    const d = new Date(date); const n = new Date(d); n.setDate(n.getDate() + 1);
    filter.scheduledDate = { $gte: d, $lt: n };
  }
  if (search) filter.jobTitle = { $regex: search, $options: 'i' };
  const skip = (+page - 1) * +limit;
  const [items, total] = await Promise.all([
    Assignment.find(filter).populate('clientId').populate('locationId').sort({ scheduledDate: -1 }).skip(skip).limit(+limit),
    Assignment.countDocuments(filter),
  ]);
  res.json({ items, total });
});

// --- 2. CREATE ASSIGNMENT ---
r.post('/', adminOnly, async (req, res) => {
  try {
    const {
      clientId, locationId, employeeIds, jobTitle, jobDescription, scheduledDate,
      startTime, expectedEndTime, priority, additionalInstructions, adminNotes,
      customerName, customerPhone, customClientName, customLocationAddress, overrideConflict,
    } = req.body;

    if (!employeeIds?.length || !jobTitle || !scheduledDate) {
      return res.status(400).json({ error: 'Missing required fields: Employees, Job Title, Date' });
    }

    const employees = await Employee.find({ _id: { $in: employeeIds } });
    const inactive = employees.filter(e => e.employmentStatus !== 'ACTIVE');
    if (inactive.length) return res.status(400).json({ error: 'Inactive employees', inactive: inactive.map(e => e.fullName) });

    // Conflict check
    const d = new Date(scheduledDate); const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(d); dayEnd.setHours(23,59,59,999);
    const conflicts = await AssignmentEmployee.find({ employeeId: { $in: employeeIds } }).populate({
      path: 'assignmentId', match: { scheduledDate: { $gte: dayStart, $lte: dayEnd }, status: { $nin: ['CANCELLED', 'COMPLETED'] } }
    });
    const real = conflicts.filter((c: any) => c.assignmentId);
    if (real.length && !overrideConflict) {
      return res.status(409).json({ error: 'Scheduling conflict', conflicts: real.map((c: any) => ({ employeeId: c.employeeId, assignment: c.assignmentId.assignmentCode })) });
    }

    const assignmentCode = await genCode();
    const assignment = await Assignment.create({
      assignmentCode, 
      clientId: clientId || undefined, 
      locationId: locationId || undefined, 
      jobTitle, jobDescription, scheduledDate,
      startTime, expectedEndTime, priority: priority || 'MEDIUM', status: 'ASSIGNED',
      additionalInstructions, adminNotes, customerName, customerPhone,
      customClientName, customLocationAddress
    });
    
    const aes = await Promise.all(employeeIds.map((employeeId: string) =>
      AssignmentEmployee.create({ assignmentId: assignment._id, employeeId })));

    const client = clientId ? await Client.findById(clientId) : null;
    const location = locationId ? await Location.findById(locationId) : null;

    const displayClientName = client ? client.clientName : (customClientName || 'N/A');
    const displayLocationName = location ? location.locationName : 'Custom Location';
    const displayAddress = location ? location.address : (customLocationAddress || 'See instructions');
    
    if (employees.length) {
      for (const emp of employees) {
        
        // BUILDING THE EXACT MESSAGE YOU WANT
        const messageBody = `Hello ${emp.fullName},

You have been assigned a new job.

Client: ${displayClientName}
Location: ${displayLocationName}
Address: ${displayAddress}
Job: ${jobTitle}
Date: ${new Date(scheduledDate).toDateString()}
Time: ${startTime} - ${expectedEndTime}
Priority: ${assignment.priority}

Instructions: ${additionalInstructions || 'Please reach the location on time.'}

Thank you.`;

        await sendWhatsApp({
          to: emp.whatsappNumber,
          messageType: 'NEW_ASSIGNMENT',
          // NO templateName here, so it sends as a free-text message
          fallbackText: messageBody, 
          assignmentId: assignment.id, 
          employeeId: emp.id,
        });
        
        await Notification.create({
          userId: emp.userId, title: 'New Job Assignment',
          message: `${jobTitle} on ${new Date(scheduledDate).toDateString()}`,
          notificationType: 'ASSIGNMENT',
        });
      }
    }

    res.status(201).json({ assignment, employees: aes });
  } catch (e: any) { console.error(e); res.status(500).json({ error: e.message }); }
});

// --- 3. GET SINGLE ASSIGNMENT ---
r.get('/:id', adminOnly, async (req, res) => {
  const assignment = await Assignment.findById(req.params.id).populate('clientId').populate('locationId');
  if (!assignment) return res.status(404).json({ error: 'Not found' });
  const employees = await AssignmentEmployee.find({ assignmentId: assignment.id }).populate('employeeId');
  res.json({ assignment, employees });
});

// --- 4. UPDATE ASSIGNMENT ---
r.put('/:id', adminOnly, async (req, res) => res.json(await Assignment.findByIdAndUpdate(req.params.id, req.body, { new: true })));

// --- 5. CANCEL ASSIGNMENT ---
r.patch('/:id/cancel', adminOnly, async (req, res) => {
  const assignment = await Assignment.findByIdAndUpdate(req.params.id, { status: 'CANCELLED' }, { new: true })
    .populate('clientId').populate('locationId');
  if (!assignment) return res.status(404).json({ error: 'Not found' });
  
  await AssignmentEmployee.updateMany({ assignmentId: assignment.id }, { status: 'CANCELLED' });
  const aes = await AssignmentEmployee.find({ assignmentId: assignment.id }).populate('employeeId');
  
  for (const ae of aes) {
    const emp: any = ae.employeeId;
    if (emp) {
      const cancelBody = `Hello ${emp.fullName},\n\nYour assignment (${assignment.assignmentCode}) for ${new Date(assignment.scheduledDate).toDateString()} has been CANCELLED.\n\nThank you.`;
      await sendWhatsApp({
        to: emp.whatsappNumber,
        messageType: 'CANCELLATION', 
        fallbackText: cancelBody,
        assignmentId: assignment.id, employeeId: emp.id,
      });
    }
  }
  res.json(assignment);
});

// --- 6. RESCHEDULE ASSIGNMENT ---
r.patch('/:id/reschedule', adminOnly, async (req, res) => {
  const { scheduledDate, startTime, expectedEndTime } = req.body;
  const assignment = await Assignment.findByIdAndUpdate(req.params.id, { scheduledDate, startTime, expectedEndTime }, { new: true })
    .populate('clientId').populate('locationId');
  if (!assignment) return res.status(404).json({ error: 'Not found' });
  
  const aes = await AssignmentEmployee.find({ assignmentId: assignment.id }).populate('employeeId');
  for (const ae of aes) {
    const emp: any = ae.employeeId;
    if (emp) {
      const rescheduleBody = `Hello ${emp.fullName},\n\nYour assignment (${assignment.assignmentCode}) has been RESCHEDULED.\n\nNew Date: ${new Date(scheduledDate).toDateString()}\nNew Time: ${startTime} - ${expectedEndTime}\n\nThank you.`;
      await sendWhatsApp({
        to: emp.whatsappNumber,
        messageType: 'RESCHEDULE',
        fallbackText: rescheduleBody,
        assignmentId: assignment.id, employeeId: emp.id,
      });
    }
  }
  res.json(assignment);
});

// --- 7. UPDATE EMPLOYEE STATUS (ACCEPT / START / COMPLETE) ---
r.patch('/:id/employees/:employeeId/status', async (req: AuthRequest, res) => {
  const { status } = req.body;
  const assignment = await Assignment.findById(req.params.id).populate('clientId').populate('locationId');
  if (!assignment) return res.status(404).json({ error: 'Not found' });

  let targetEmpId = req.params.employeeId;
  if (req.user!.role === 'EMPLOYEE') {
    const emp = await Employee.findOne({ userId: req.user!.id });
    if (!emp || emp.id !== targetEmpId) return res.status(403).json({ error: 'Forbidden' });
  }

  const ae = await AssignmentEmployee.findOne({ assignmentId: req.params.id, employeeId: targetEmpId });
  if (!ae) return res.status(404).json({ error: 'Not found' });

  ae.status = status;
  const now = new Date();
  if (status === 'ACCEPTED') ae.acceptedAt = now;
  if (status === 'IN_PROGRESS') ae.startedAt = now;
  if (status === 'COMPLETED') ae.completedAt = now;
  await ae.save();

  // Update main assignment status based on all employees
  const all = await AssignmentEmployee.find({ assignmentId: assignment.id });
  const s = all.map(x => x.status);
  let ps: any = 'ASSIGNED';
  if (s.every(x => x === 'COMPLETED')) ps = 'COMPLETED';
  else if (s.some(x => x === 'IN_PROGRESS')) ps = 'IN_PROGRESS';
  else if (s.some(x => x === 'ACCEPTED')) ps = 'ACCEPTED';
  else if (s.every(x => x === 'CANCELLED')) ps = 'CANCELLED';
  assignment.status = ps; await assignment.save();

  // --- TRIGGER FEEDBACK ---
  if (status === 'COMPLETED') {
    const fr = await createFeedbackRequest(assignment.id, targetEmpId);
    const emp = await Employee.findById(targetEmpId);
    const client: any = assignment.clientId;
    const customerPhone = assignment.customerPhone || client?.whatsappNumber || client?.phone;
    
    if (emp && customerPhone) {
      const feedbackBody = `Hello ${assignment.customerName || 'Customer'},\n\nThank you for choosing our services!\n\nOur team has completed your requested service. We would appreciate your feedback:\n\n${buildFeedbackUrl(fr.token)}\n\nThank you!`;
      await sendWhatsApp({
        to: customerPhone,
        messageType: 'FEEDBACK_REQUEST',
        fallbackText: feedbackBody,
        assignmentId: assignment.id, employeeId: emp.id, customerId: client?.id,
      });
    }
    
    const admins = await User.find({ role: 'ADMIN' });
    for (const ad of admins) {
      await Notification.create({
        userId: ad._id, title: 'Job Completed',
        message: `${assignment.assignmentCode} completed by ${emp?.fullName}`,
        notificationType: 'COMPLETION',
      });
    }
  }

  res.json(ae);
});

export default r;
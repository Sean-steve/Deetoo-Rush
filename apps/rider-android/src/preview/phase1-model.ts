/**
 * Phase 1 Rider prototype state and validation.
 * No API, secure credentials, real documents, rider approvals or financial side effects.
 */
export type RiderScreen = 'login' | 'registration' | 'documents' | 'vehicle' | 'status' | 'dashboard';
export type RiderTab = 'Home' | 'Deliveries' | 'Earnings' | 'Inbox' | 'Profile';
export type RiderVehicleType = 'Motorcycle' | 'Bicycle' | 'Car / Van';
export type MockApplicationStatus = 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'approved';

export type RiderRegistration = {
  fullName: string;
  phone: string;
  email: string;
  nationalId: string;
  dateOfBirth: string;
  address: string;
  county: string;
  emergencyName: string;
  emergencyPhone: string;
};
export const emptyRegistration: RiderRegistration = {
  fullName: '', phone: '', email: '', nationalId: '', dateOfBirth: '',
  address: '', county: 'Nairobi', emergencyName: '', emergencyPhone: '',
};

export type RiderDocument = 'idFront' | 'idBack' | 'selfie' | 'licence';
export const documentNames: Record<RiderDocument, string> = {
  idFront: 'National ID (front)',
  idBack: 'National ID (back)',
  selfie: 'Profile photo / selfie',
  licence: 'Driving licence',
};
export type RiderDocuments = Record<RiderDocument, boolean>;
export const emptyDocuments: RiderDocuments = {
  idFront: false, idBack: false, selfie: false, licence: false,
};

export type RiderVehicle = {
  type: RiderVehicleType;
  registrationNumber: string;
  make: string;
  model: string;
  colour: string;
  year: string;
  logbook: boolean;
  insurance: boolean;
  deliveryBag: boolean;
  helmet: boolean;
  reflectiveVest: boolean;
  phoneMount: boolean;
};
export const emptyVehicle: RiderVehicle = {
  type: 'Motorcycle', registrationNumber: '', make: '', model: '', colour: '',
  year: '', logbook: false, insurance: false, deliveryBag: false,
  helmet: false, reflectiveVest: false, phoneMount: false,
};

export function validKenyanPhone(value: string): boolean {
  const cleaned = value.replace(/[\s()-]/g, '');
  return /^(?:\+254|254)[17]\d{8}$/.test(cleaned) || /^0[17]\d{8}$/.test(cleaned);
}
export function validIdentity(value: string): boolean {
  return validKenyanPhone(value) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}
export function validateRegistration(data: RiderRegistration): string | null {
  if (data.fullName.trim().split(/\s+/).filter(Boolean).length < 2) return 'Enter your first and last name.';
  if (!validKenyanPhone(data.phone)) return 'Enter a valid Kenyan phone number (07…, 01… or +254…).';
  if (data.email.trim() && !validIdentity(data.email)) return 'Enter a valid email address.';
  if (!/^[A-Za-z0-9]{5,12}$/.test(data.nationalId.trim())) return 'Enter a valid ID or identification number.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth) || Number.isNaN(Date.parse(data.dateOfBirth))) return 'Enter date of birth as YYYY-MM-DD.';
  if (!data.address.trim() || !data.county.trim()) return 'Enter your address and county.';
  if (!data.emergencyName.trim()) return 'Enter an emergency contact name.';
  if (!validKenyanPhone(data.emergencyPhone)) return 'Enter a valid emergency contact phone number.';
  if (data.emergencyPhone.replace(/\D/g, '').slice(-9) === data.phone.replace(/\D/g, '').slice(-9)) return 'Use a different emergency contact number.';
  return null;
}
export function requiresDrivingLicence(vehicleType: RiderVehicleType): boolean {
  return vehicleType !== 'Bicycle';
}
export function validateDocuments(docs: RiderDocuments, vehicleType: RiderVehicleType): string | null {
  if (!docs.idFront || !docs.idBack || !docs.selfie) return 'Stage both sides of your ID and a profile photo.';
  if (requiresDrivingLicence(vehicleType) && !docs.licence) return 'A driving licence is required for the selected vehicle.';
  return null;
}
export function validateVehicle(vehicle: RiderVehicle): string | null {
  if (vehicle.type !== 'Bicycle' && !vehicle.registrationNumber.trim()) return 'Enter the vehicle registration number.';
  if (!vehicle.make.trim() || !vehicle.model.trim()) return 'Enter the vehicle make and model.';
  if (!vehicle.deliveryBag) return 'Confirm you have an insulated delivery bag.';
  if (vehicle.type !== 'Bicycle' && (!vehicle.logbook || !vehicle.insurance)) return 'Stage the logbook and insurance for the vehicle.';
  if (vehicle.type === 'Motorcycle' && (!vehicle.helmet || !vehicle.reflectiveVest)) return 'Confirm your helmet and reflective vest.';
  return null;
}
export type RiderPhase = { key: RiderScreen; title: string };
export const onboardingPhases: RiderPhase[] = [
  { key: 'registration', title: 'Personal details' },
  { key: 'documents', title: 'Documents' },
  { key: 'vehicle', title: 'Vehicle' },
  { key: 'status', title: 'Review' },
];
export const mockActivity = {
  dailyEarnings: 2450,
  completedToday: 5,
  averagePerDelivery: 490,
  tips: 350,
  weeklyEarnings: 5800,
  weeklyDeliveries: 12,
  weeklyTarget: 20,
  riderRating: 4.8,
  completionRate: 92,
};
export function kes(value: number): string {
  return 'KSh ' + value.toLocaleString('en-KE');
}

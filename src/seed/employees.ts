import type { Employee, Role } from '../lib/types';
import { DEFAULT_PIN, hashPin } from '../lib/pin';

const PEOPLE: Array<[id: string, name: string, role: Role]> = [
  ['elad', 'אלעד', 'manager'],
  ['midori', 'מידורי', 'manager'],
  ['ari', 'ארי', 'manager'],
  ['gaia', 'גאיה', 'staff'],
  ['bar', 'בר', 'staff'],
  ['anker', 'אנקר', 'staff'],
  ['nadin', 'נדין', 'staff'],
  ['nicole', 'ניקול', 'staff'],
  ['ayala', 'איילה', 'staff'],
  ['tomer', 'תומר', 'staff'],
];

export async function seedEmployees(): Promise<Employee[]> {
  const createdAt = new Date().toISOString();
  return Promise.all(
    PEOPLE.map(async ([id, name, role]) => ({
      id,
      name,
      role,
      pinHash: await hashPin(id, DEFAULT_PIN),
      mustChangePin: true,
      inventoryEditor: id === 'gaia',
      createdAt,
    })),
  );
}

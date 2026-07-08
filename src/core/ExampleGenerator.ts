import { CommandMetadata } from './Dispatcher';

export class ExampleGenerator {
  /**
   * Generates a realistic example payload based on a parameter model.
   * @param paramsModel Record mapping field names to types (e.g., { name: 'string', age: 'int' })
   */
  public static generate(paramsModel?: Record<string, string>): Record<string, any> {
    if (!paramsModel) return {};

    const example: Record<string, any> = {};

    for (const [key, type] of Object.entries(paramsModel)) {
      example[key] = this.getValueForType(type, key);
    }

    return example;
  }

  private static getValueForType(type: string, key: string): any {
    const lowerType = type.toLowerCase();

    if (lowerType === 'string') {
      // Provide slightly more realistic strings based on key names
      if (key.includes('email')) return 'user@example.com';
      if (key.includes('name')) return 'John Doe';
      if (key.includes('id') || key.includes('uuid')) return '550e8400-e29b-41d4-a716-446655440000';
      if (key.includes('phone')) return '+1234567890';
      if (key.includes('role')) return 'employee';
      return 'example_text';
    }

    if (lowerType === 'int' || lowerType === 'integer') return 100;
    if (lowerType === 'float' || lowerType === 'decimal') return 99.99;
    if (lowerType === 'boolean' || lowerType === 'bool') return true;
    if (lowerType === 'list' || lowerType === 'array') return [1, 2, 3];

    return 'unknown_type';
  }
}

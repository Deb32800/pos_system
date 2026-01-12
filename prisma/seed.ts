import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { generateRecoveryKey, hashRecoveryKey } from '../lib/recovery'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting fresh database seed...')

  // Generate recovery key for first-run setup
  const recoveryKey = generateRecoveryKey()
  const recoveryKeyHash = await hashRecoveryKey(recoveryKey)

  // Create admin user with mustChangePassword = true
  const adminPasswordHash = await bcrypt.hash('admin123', 10)

  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash: adminPasswordHash,
      mustChangePassword: true,
    },
    create: {
      username: 'admin',
      passwordHash: adminPasswordHash,
      fullName: 'Administrator',
      role: 'ADMIN',
      isActive: true,
      mustChangePassword: true,
    },
  })

  console.log('✓ Created admin user (username: admin, password: admin123)')
  console.log('  ⚠ Password change required on first login')

  // Create essential settings only
  const settings = [
    { key: 'store_name', value: 'My POS Store', description: 'Store name' },
    { key: 'tax_rate', value: '0.0', description: 'Tax rate percentage' },
    { key: 'currency', value: 'USD', description: 'Currency code' },
    { key: 'recovery_key_hash', value: recoveryKeyHash, description: 'Master recovery key hash' },
    { key: 'first_run_complete', value: 'false', description: 'Whether first-run setup is complete' },
  ]

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: setting,
    })
  }

  console.log('✓ Created essential settings')
  console.log('')
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║                    MASTER RECOVERY KEY                     ║')
  console.log('╠════════════════════════════════════════════════════════════╣')
  console.log(`║        ${recoveryKey}           ║`)
  console.log('╠════════════════════════════════════════════════════════════╣')
  console.log('║  SAVE THIS KEY! It will be shown again on first login.    ║')
  console.log('║  You will need it to reset the admin password if lost.    ║')
  console.log('╚════════════════════════════════════════════════════════════╝')
  console.log('')
  console.log('Database seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

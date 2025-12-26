import { execSync } from 'node:child_process'
import path from 'node:path'
import pc from 'picocolors'
import fs from 'fs-extra'
import * as p from '@clack/prompts'

interface PackageJson {
  name: string
  version: string
  [key: string]: any
}



const exec = (cmd: string, errorMsg: string, silent = false): boolean => {
  try {
    if (!silent) {
      console.log(pc.cyan(`\n🔄 执行：${cmd}`))
    }
    execSync(cmd, { stdio: silent ? 'pipe' : 'inherit' })
    return true
  }
  catch (error: any) {
    console.error(pc.red(`\n❌ ${errorMsg}`))
    if (error.stderr) {
      console.error(pc.gray(error.stderr.toString()))
    }
    return false
  }
}

const readPackageJson = async (): Promise<PackageJson> => {
  const pkgPath = path.join(process.cwd(), 'package.json')
  return await fs.readJson(pkgPath)
}

const writePackageJson = async (pkg: PackageJson): Promise<void> => {
  const pkgPath = path.join(process.cwd(), 'package.json')
  await fs.writeJson(pkgPath, pkg, { spaces: 2 })
}


const main = async (): Promise<void> => {
  console.log(pc.bold(pc.blue('🚀 开始安全发布流程...\n')))

  // 1. 读取当前版本
  const pkg = await readPackageJson()
  const currentVersion = pkg.version
  console.log(pc.yellow(`📌 当前版本：${currentVersion}\n`))

  // 2. 选择新版本
  const versionParts = currentVersion.split('.').map(Number)
  const suggestions = {
    patch: `${versionParts[0]}.${versionParts[1]}.${versionParts[2] + 1}`,
    minor: `${versionParts[0]}.${versionParts[1] + 1}.0`,
    major: `${versionParts[0] + 1}.0.0`,
  }

  const versionType = await p.select({
    message: '选择新版本类型:',
    options:[
        { value: 'patch', label: `patch (${suggestions.patch}) - 修复 bug` },
        { value: 'minor', label: `minor (${suggestions.minor}) - 新功能` },
        { value: 'major', label: `major (${suggestions.major}) - 破坏性更新` },
        { value: 'custom', label: '自定义版本号' },
    ]
  })

  if(p.isCancel(versionType)){
    p.cancel('发布流程已取消。')
    process.exit(0)
  }

  let newVersion = ''

  if(versionType ==='custom'){
    const customVersion = await p.text({
        message:'请输入自定义版本号:',
        placeholder:'例如: 1.5.0',
        validate:(value:string) =>{
            if (!/^\d+\.\d+\.\d+$/.test(value)) {
                return '版本号格式无效，应为 x.y.z'
            }
        }
    })

    if(p.isCancel(customVersion)){
        p.cancel('发布流程已取消')
        process.exit(0)
    }

    newVersion = customVersion as string
  }else{
    newVersion = suggestions[versionType as keyof typeof suggestions]
  }

  // 3. 更新 package.json
  console.log(pc.magenta(`\n✏️  步骤 1: 更新版本号 ${currentVersion} → ${newVersion}`))
  pkg.version = newVersion
  await writePackageJson(pkg)

  // 4. 发布到 npm (会自动触发 prepublishOnly 钩子进行构建)
  console.log(pc.cyan('\n📤 步骤 2: 发布到 npm (自动构建中...)'))
  const publishSuccess = exec('pnpm publish --no-git-checks', '发布失败，回退版本号', false)

  if (!publishSuccess) {
    console.log(pc.yellow('\n⏮️  正在回退版本号...'))
    pkg.version = currentVersion
    await writePackageJson(pkg)
    console.log(pc.green(`✅ 版本号已成功回退到 ${currentVersion}`))
    console.log(pc.red('\n❌ 发布流程已中止（这是预期行为，非异常）'))
    console.log(pc.gray('   原因：npm 发布失败'))
    console.log(pc.gray('   建议：检查 npm 登录状态或版本冲突\n'))
    process.exit(1)
  }

  console.log(pc.green('\n✅ 发布成功！'))

  // 5. 生成 CHANGELOG
  console.log(pc.cyan('\n📝 步骤 3: 生成 CHANGELOG'))
  exec('npx conventional-changelog -p angular -i CHANGELOG.md -s', 'CHANGELOG 生成失败（可忽略）')

  // 6. Git 提交
  console.log(pc.cyan('\n📌 步骤 4: 提交到 Git'))
  exec('git add .', 'Git add 失败')
  exec(`git commit -m "chore: release v${newVersion}"`, 'Git commit 失败')

  const shouldPush = await p.confirm({
    message:'是否推送到远程仓库？'
  })
    if (p.isCancel(shouldPush)) {
        p.outro('发布完成（未推送）')
        process.exit(0)
    }

    if (shouldPush) {
        exec('git push', 'Git push 失败')
    }

  p.outro(pc.green(`🎉 发布完成！版本：${currentVersion} → ${newVersion}\n   npm: https://www.npmjs.com/package/${pkg.name}`))
}

main().catch((error) => {
  console.error(pc.red('\n❌ 发布失败:'), error)
  process.exit(1)
})

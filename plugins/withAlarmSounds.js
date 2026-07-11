// Config plugin: embute os sons de alarme (assets/sounds/*.wav) no bundle
// principal do projeto iOS gerado, na fase "Copy Bundle Resources" do
// Xcode — automaticamente, a cada `expo prebuild` (o mesmo passo que já
// roda no CI, sem precisar de Mac nem de passo manual).
//
// Mesmo padrão usado pelo próprio pacote oficial expo-notifications pra
// sons customizados de notificação (withNotificationsIOS.ts,
// IOSConfig.XcodeUtils.addResourceFileToGroup) — não é invenção nossa,
// é o mecanismo documentado do Expo pra "preciso de um arquivo nativo
// dentro do bundle que o Metro/JS não carrega".
const { withXcodeProject, IOSConfig } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SOUND_EXTENSIONS = new Set(['.wav', '.aiff', '.caf']);

const withAlarmSounds = (config, { soundsDir = 'assets/sounds' } = {}) => {
  return withXcodeProject(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const projectName = config.modRequest.projectName;
    const sourceRoot = IOSConfig.Paths.getSourceRoot(projectRoot);
    const sourceDir = path.resolve(projectRoot, soundsDir);
    if (!fs.existsSync(sourceDir)) {
      throw new Error(
        `withAlarmSounds: pasta de sons não encontrada em "${sourceDir}". Verifique se ${soundsDir} existe no projeto.`,
      );
    }

    let project = config.modResults;
    const fileNames = fs
      .readdirSync(sourceDir)
      .filter((fileName) => SOUND_EXTENSIONS.has(path.extname(fileName).toLowerCase()));

    for (const fileName of fileNames) {
      const src = path.join(sourceDir, fileName);
      const dest = path.join(sourceRoot, fileName);
      fs.copyFileSync(src, dest);

      if (!project.hasFile(`${projectName}/${fileName}`)) {
        project = IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath: `${projectName}/${fileName}`,
          groupName: projectName,
          isBuildFile: true,
          project,
        });
      }
    }

    config.modResults = project;
    return config;
  });
};

module.exports = withAlarmSounds;

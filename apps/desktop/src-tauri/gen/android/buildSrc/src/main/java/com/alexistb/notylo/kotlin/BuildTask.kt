import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val executable = """pnpm""";
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )

                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("tauri", "android", "android-studio-script");
        val androidRustFlags = listOf(
            "-Clink-arg=-landroid",
            "-Clink-arg=-llog",
            "-Clink-arg=-lOpenSLES",
            "-Clink-arg=-Wl,-z,max-page-size=16384",
            "-Clink-arg=-Wl,-z,common-page-size=16384",
        ).joinToString(" ")

        project.exec {
            workingDir(File(project.projectDir, rootDirRel))
            executable(executable)
            args(args)
            // Tauri supplies target-specific Rust flags to this Gradle task. Add
            // 16 KiB ELF page alignment here so they are not overridden.
            environment("CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS", androidRustFlags)
            environment("CARGO_TARGET_ARMV7_LINUX_ANDROIDEABI_RUSTFLAGS", androidRustFlags)
            environment("CARGO_TARGET_I686_LINUX_ANDROID_RUSTFLAGS", androidRustFlags)
            environment("CARGO_TARGET_X86_64_LINUX_ANDROID_RUSTFLAGS", androidRustFlags)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}

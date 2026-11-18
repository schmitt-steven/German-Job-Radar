package io.github.schmittsteven.germanjobradar.config;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Map;

import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/** Resolves the per-OS app data folder and exposes it as {@code jobradar.data-dir}. */
public class AppDataFolderPostProcessor implements EnvironmentPostProcessor {

	@Override
	public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
		Path dir = resolveDataDir();
		try {
			Files.createDirectories(dir);
		} catch (IOException e) {
			throw new UncheckedIOException("Cannot create app data folder " + dir, e);
		}
		// Forward slashes keep the JDBC URL valid on Windows
		String value = dir.toString().replace('\\', '/');
		environment.getPropertySources().addFirst(new MapPropertySource("jobradarDataDir", Map.of("jobradar.data-dir", value)));
	}

	private static Path resolveDataDir() {
		String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
		Path home = Path.of(System.getProperty("user.home"));
		if (os.contains("win")) {
			String appData = System.getenv("APPDATA");
			Path base = appData != null ? Path.of(appData) : home.resolve("AppData/Roaming");
			return base.resolve("JobRadar");
		}
		if (os.contains("mac")) {
			return home.resolve("Library/Application Support/JobRadar");
		}
		return home.resolve(".local/share/jobradar");
	}

}

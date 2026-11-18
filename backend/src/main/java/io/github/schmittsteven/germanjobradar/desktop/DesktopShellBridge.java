package io.github.schmittsteven.germanjobradar.desktop;

import java.io.IOException;
import java.io.OutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Talks to the desktop shell over stdio: announces readiness on stdout, exits when stdin closes. */
@Component
@ConditionalOnBooleanProperty("jobradar.is-desktop-shell")
public class DesktopShellBridge {

	// The shell waits for this exact line before showing the UI
	static final String READY_MARKER = "JOBRADAR_READY";

	private static final Logger log = LoggerFactory.getLogger(DesktopShellBridge.class);

	private final ConfigurableApplicationContext context;

	public DesktopShellBridge(ConfigurableApplicationContext context) {
		this.context = context;
	}

	@EventListener(ApplicationReadyEvent.class)
	public void onReady() {
		System.out.println(READY_MARKER);
		System.out.flush();
		Thread.ofPlatform().daemon().name("desktop-shell-watch").start(this::exitWhenShellCloses);
	}

	// stdin reaches EOF when the shell quits or crashes
	private void exitWhenShellCloses() {
		try {
			System.in.transferTo(OutputStream.nullOutputStream());
		} catch (IOException e) {
			log.warn("Lost the desktop shell's stdin", e);
		}
		log.info("Desktop shell closed, shutting down");
		System.exit(SpringApplication.exit(context));
	}

}

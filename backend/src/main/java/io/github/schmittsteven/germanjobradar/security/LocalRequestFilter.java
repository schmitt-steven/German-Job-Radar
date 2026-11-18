package io.github.schmittsteven.germanjobradar.security;

import java.io.IOException;
import java.util.Set;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class LocalRequestFilter extends OncePerRequestFilter {

	private static final String HEADER_NAME = "X-Job-Radar";
	private static final String HEADER_VALUE = "1";

	private final Set<String> allowedHosts;

	public LocalRequestFilter(@Value("${server.port}") int port) {
		this.allowedHosts = Set.of("127.0.0.1:" + port, "localhost:" + port);
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		boolean isHostAllowed = allowedHosts.contains(request.getHeader("Host"));
		boolean isApiRequest = request.getRequestURI().startsWith("/api/");
		boolean isHeaderMissing = !HEADER_VALUE.equals(request.getHeader(HEADER_NAME));

		if (!isHostAllowed || (isApiRequest && isHeaderMissing)) {
			response.setStatus(HttpServletResponse.SC_FORBIDDEN);
			return;
		}
		chain.doFilter(request, response);
	}

}

package io.github.schmittsteven.germanjobradar.config;

import java.io.IOException;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

@Configuration
public class SpaFallbackConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/**")
            .addResourceLocations("classpath:/static/")
            .resourceChain(true)
            .addResolver(new PathResourceResolver() {
                @Override
                protected Resource getResource(String resourcePath, Resource location) throws IOException {
                    Resource file = location.createRelative(resourcePath);
                    if (file.exists() && file.isReadable()) {
                        return file;
                    }
                    // Unknown paths and missing files -> 404
                    if (resourcePath.startsWith("api/") || resourcePath.contains(".")) {
                        return null;
                    }
                    return new ClassPathResource("static/index.html");
                }
            });
    }
}

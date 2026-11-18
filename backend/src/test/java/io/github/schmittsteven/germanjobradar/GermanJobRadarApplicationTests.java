package io.github.schmittsteven.germanjobradar;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import io.github.schmittsteven.germanjobradar.job_sources.ArbeitsagenturSource;
import io.github.schmittsteven.germanjobradar.job_sources.JobSource;
import io.github.schmittsteven.germanjobradar.jobs.JobView;
import io.github.schmittsteven.germanjobradar.status.StatusResponse;
import io.github.schmittsteven.germanjobradar.status.StatusService;

@SpringBootTest
class GermanJobRadarApplicationTests {

	@Autowired
	private List<JobSource> sources;

	@Autowired
	private StatusService statusService;

	@Test
	void contextLoads() {
	}

	@Test
	void statusCanBeReadInsideItsReadOnlyTransaction() {
		StatusResponse status = statusService.getStatus();

		assertThat(status.counts()).containsKeys(JobView.ALL, JobView.NEW, JobView.OFFLINE);
	}

	@Test
	void arbeitsagenturIsARegisteredSource() {
		assertThat(sources).anyMatch(source -> source instanceof ArbeitsagenturSource);
	}

}

package io.github.schmittsteven.germanjobradar.profile;

import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class UserProfileRepository {

    private final JdbcClient jdbc;

    public UserProfileRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public UserProfile get() {
        List<String> searchTerms = jdbc.sql("SELECT term FROM user_profile_search_term ORDER BY id")
                .query(String.class)
                .list();
        return jdbc.sql("SELECT location_plz, location_name, search_radius FROM user_profile WHERE id = 1")
                .query((rs, rowNum) -> {
                    // wasNull() only refers to the column read just before it.
                    int searchRadius = rs.getInt("search_radius");
                    Integer nullableSearchRadius = rs.wasNull() ? null : searchRadius;
                    return new UserProfile(
                            searchTerms,
                            rs.getString("location_plz"),
                            rs.getString("location_name"),
                            nullableSearchRadius);
                })
                .single();
    }

    @Transactional
    public void save(UserProfile profile) {
        jdbc.sql("UPDATE user_profile SET location_plz = :plz, location_name = :name, search_radius = :radius WHERE id = 1")
                .param("plz", profile.getLocationPlz())
                .param("name", profile.getLocationName())
                .param("radius", profile.getSearchRadius())
                .update();
        jdbc.sql("DELETE FROM user_profile_search_term").update();
        for (String term : profile.getSearchTerms()) {
            jdbc.sql("INSERT INTO user_profile_search_term (term) VALUES (:term)")
                    .param("term", term)
                    .update();
        }
    }
}

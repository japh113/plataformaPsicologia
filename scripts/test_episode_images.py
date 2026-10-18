import copy
import unittest
from episode_images import expected_images, validate_config, verify_baseline, OWNER_LABEL

PROJECT = "psicopanel-episodes-12345678-1234-1234-1234-123456789abc"


class EpisodeImageIsolationTests(unittest.TestCase):
    def setUp(self):
        backend, frontend = expected_images(PROJECT)
        self.config = {"services": {
            name: {"image": image, "build": {"labels": {OWNER_LABEL: PROJECT}}}
            for name, image in [("backend", backend), ("api", backend), ("frontend", frontend)]
        }}
        self.development = {"plataformapsicologia-backend:latest", "plataformapsicologia-frontend:latest"}

    def test_application_tags_are_scoped_and_api_reuses_backend(self):
        validate_config(PROJECT, self.config, self.development, self.development)

    def test_previous_shared_tags_are_rejected_for_every_service(self):
        for service in ["backend", "api", "frontend"]:
            with self.subTest(service=service):
                config = copy.deepcopy(self.config)
                config["services"][service]["image"] = "plataformapsicologia-backend:latest"
                with self.assertRaisesRegex(ValueError, "overlaps development"):
                    validate_config(PROJECT, config, self.development, {})

    def test_foreign_run_tags_and_missing_ownership_are_rejected(self):
        config = copy.deepcopy(self.config)
        config["services"]["api"]["image"] = "another-project-backend:isolated"
        with self.assertRaisesRegex(ValueError, "belong to this execution"):
            validate_config(PROJECT, config, self.development, {})
        config = copy.deepcopy(self.config)
        config["services"]["frontend"]["build"]["labels"] = {}
        with self.assertRaisesRegex(ValueError, "ownership"):
            validate_config(PROJECT, config, self.development, {})

    def test_image_destination_cannot_be_reused(self):
        with self.assertRaisesRegex(ValueError, "reused image destination"):
            validate_config(PROJECT, self.config, self.development, expected_images(PROJECT))

    def test_preexisting_tags_cannot_be_retargeted_or_removed(self):
        baseline = {"development:latest": "sha256:original"}
        verify_baseline(baseline, {**baseline, "new-isolated:tag": "sha256:new"})
        for current in [{}, {"development:latest": "sha256:overwritten"}]:
            with self.assertRaisesRegex(ValueError, "Pre-existing image tags changed"):
                verify_baseline(baseline, current)

    def test_cleanup_scope_requires_an_episode_uuid_project(self):
        for project in ["plataformapsicologia", "psicopanel-episodes-", PROJECT + "-other"]:
            with self.assertRaisesRegex(ValueError, "Invalid isolated project"):
                expected_images(project)


if __name__ == "__main__":
    unittest.main()

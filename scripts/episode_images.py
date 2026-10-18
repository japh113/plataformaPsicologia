"""Guard and clean only application image tags owned by one episode sandbox."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
PROJECT_PATTERN = r"psicopanel-episodes-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}"
OWNER_LABEL = "io.psicopanel.episodes.project"


def docker(*args):
    return subprocess.check_output(["docker", *args], cwd=ROOT, text=True).strip()


def expected_images(project):
    if not re.fullmatch(PROJECT_PATTERN, project):
        raise ValueError("Invalid isolated project name")
    return [f"{project}-backend:isolated", f"{project}-frontend:isolated"]


def validate_config(project, config, development_images, existing_images):
    backend, frontend = expected_images(project)
    services = config["services"]
    for service, expected in [("backend", backend), ("api", backend), ("frontend", frontend)]:
        actual = services[service].get("image")
        if actual in development_images:
            raise ValueError("Isolated application image overlaps development: " + actual)
        if actual != expected:
            raise ValueError("Application image must belong to this execution: " + service)
        if services[service]["build"].get("labels", {}).get(OWNER_LABEL) != project:
            raise ValueError("Missing image ownership label: " + service)
    if set([backend, frontend]) & set(existing_images):
        raise ValueError("Refusing reused image destination")


def image_tags():
    rows = docker("image", "ls", "--no-trunc", "--format", "{{.Repository}}:{{.Tag}} {{.ID}}")
    return dict(row.split(" ", 1) for row in rows.splitlines() if "<none>" not in row)


def verify_baseline(baseline, current):
    changed = [tag for tag, image_id in baseline.items() if current.get(tag) != image_id]
    if changed:
        raise ValueError("Pre-existing image tags changed; no automatic repair: " + ", ".join(changed))


def state_path(project):
    expected_images(project)
    return Path(os.environ.get("TMPDIR", "/tmp")) / (project + ".images.json")


def read_state(project):
    state = json.loads(state_path(project).read_text())
    if state["project"] != project or state["images"] != expected_images(project):
        raise ValueError("Image state does not belong to this isolated execution")
    return state


def verify_owned(project, tag):
    info = json.loads(docker("image", "inspect", tag))[0]
    if info["Config"].get("Labels", {}).get(OWNER_LABEL) != project:
        raise ValueError("Refusing image without matching ownership label: " + tag)


def preflight(project):
    expected_images(project)
    config = json.loads(docker("compose", "-p", project, "-f", "compose.episodes-test.yaml",
                               "--profile", "demo", "config", "--format", "json"))
    # Read only image references, never output application environment/secrets.
    development_images = set(docker("compose", "-f", "compose.yaml", "config", "--no-interpolate", "--images").splitlines())
    development_images.update(docker("compose", "-f", "compose.integrity-test.yaml",
                                    "config", "--no-interpolate", "--images").splitlines())
    baseline = image_tags()
    validate_config(project, config, development_images, baseline)
    state = {"project": project, "images": expected_images(project), "baseline": baseline}
    # Never overwrite evidence or reuse a previous destination.
    with state_path(project).open("x") as output:
        json.dump(state, output)
    print("Verified isolated image tags: " + ", ".join(state["images"]))


def verify(project):
    state = read_state(project)
    current = image_tags()
    verify_baseline(state["baseline"], current)
    for tag in state["images"]:
        if tag not in current:
            raise ValueError("Missing isolated image: " + tag)
        verify_owned(project, tag)
    print("Verified pre-existing image tags unchanged")


def cleanup(project):
    state = read_state(project)
    current = image_tags()
    verify_baseline(state["baseline"], current)
    # Validate every candidate before removing any tag. Never remove shared base
    # images, use image IDs, force deletion, or prune the daemon/build cache.
    owned = [tag for tag in state["images"] if tag in current]
    for tag in owned:
        verify_owned(project, tag)
    if owned:
        subprocess.run(["docker", "image", "rm", "--no-prune", *owned], check=True, cwd=ROOT)
    after = image_tags()
    verify_baseline(state["baseline"], after)
    if any(tag in after for tag in state["images"]):
        raise ValueError("Isolated image cleanup incomplete")
    state_path(project).unlink()
    print("Removed only this execution's application images; pre-existing tags unchanged")


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in {"preflight", "verify", "validate-state", "cleanup"}:
        raise ValueError("Usage: episode_images.py preflight|verify|validate-state|cleanup PROJECT")
    action, project = sys.argv[1:]
    if action == "validate-state":
        read_state(project)
    else:
        {"preflight": preflight, "verify": verify, "cleanup": cleanup}[action](project)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

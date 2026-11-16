"""
First-seen expression snapshots: one face crop per (session, student, expression).

The JPEG is stored in the database row, so the row is the photo: the unique constraint means two
connections of the same student can never both store a "happy", and deleting a row (the instructor
removing a photo, a student withdrawing consent) deletes the image with it.

The session's instructors are told live over their socket: `photo.new` when a photo is stored and
`photo.removed` when one is deleted.
"""
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import ExpressionSnapshot


def enabled():
    return getattr(settings, 'EXPRESSION_SNAPSHOTS_ENABLED', True)


def min_confidence():
    return getattr(settings, 'EXPRESSION_SNAPSHOT_MIN_CONFIDENCE', 0.5)


def stored_emotions(session_id, student_id):
    return set(
        ExpressionSnapshot.objects.filter(session_id=session_id, student_id=student_id).values_list('emotion', flat=True)
    )


def photo_payload(snapshot):
    """One photo as the gallery shows it (the image itself is fetched from `url`)."""
    return {
        'id': snapshot.id,
        'confidence': round(snapshot.confidence * 100),
        'created_at': snapshot.created_at.isoformat(),
        'url': f'/api/analytics/sessions/{snapshot.session_id}/expression-snapshots/{snapshot.id}/image/',
    }


def new_photo_event(snapshot):
    """Channel-layer message telling the session's instructors about a freshly stored photo."""
    return {
        "type": "broadcast_photo_new",
        "photo": {
            "student_id": snapshot.student_id,
            "emotion": snapshot.emotion,
            "photo": photo_payload(snapshot),
        },
    }


def save_first(session_id, student, emotion, confidence, jpeg_bytes):
    """Store this face as the student's `emotion` snapshot unless one exists. Returns the new row or None."""
    if not jpeg_bytes:
        return None
    try:
        with transaction.atomic():
            return ExpressionSnapshot.objects.create(
                session_id=session_id, student=student, emotion=emotion, confidence=confidence,
                image=bytes(jpeg_bytes),
            )
    except IntegrityError:
        return None  # already stored (e.g. by the student's other tab)


def session_group(session_id):
    """Channel group of the instructors watching a session."""
    return f"session_{session_id}"


def student_group(session_id, student_id):
    """Channel group of one student's live webcam connection(s) in a session."""
    return f"snapshots_{session_id}_{student_id}"


def _send(group, message):
    layer = get_channel_layer()
    if not layer:
        return
    try:
        async_to_sync(layer.group_send)(group, message)
    except Exception as exc:  # nobody listening is fine: the gallery and the student re-read on connect
        print(f"[snapshots] could not notify {group}: {exc!r}")


def remove(snapshot):
    """
    Delete a stored photo so the expression is captured again: the student's live connection is
    told to forget the slot, and the next confident sighting is stored afresh.
    """
    session_id, student_id, emotion = snapshot.session_id, snapshot.student_id, snapshot.emotion
    snapshot.delete()
    _send(student_group(session_id, student_id), {"type": "snapshot_removed", "emotion": emotion})


@receiver(post_delete, sender=ExpressionSnapshot)
def _announce_removal(sender, instance, **kwargs):
    """However a photo goes (instructor, consent withdrawn, admin), open galleries drop it at once."""
    _send(session_group(instance.session_id), {
        "type": "broadcast_photo_removed",
        "photo": {"id": instance.id, "student_id": instance.student_id, "emotion": instance.emotion},
    })

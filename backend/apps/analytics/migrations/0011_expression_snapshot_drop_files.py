import os

from django.conf import settings
from django.db import migrations


def remove_files(apps, schema_editor):
    """The rows hold the photos now; remove the copies on disk so no photo outlives its row."""
    ExpressionSnapshot = apps.get_model('analytics', 'ExpressionSnapshot')
    for relative in ExpressionSnapshot.objects.values_list('image_path', flat=True).iterator():
        try:
            os.remove(os.path.join(settings.MEDIA_ROOT, relative))
        except OSError:
            pass


class Migration(migrations.Migration):
    """Separate from 0010 so the copied photos are committed before their files are removed."""

    dependencies = [
        ('analytics', '0010_expression_snapshot_image_in_db'),
    ]

    operations = [
        migrations.RunPython(remove_files, migrations.RunPython.noop),
        migrations.RemoveField(model_name='expressionsnapshot', name='image_path'),
    ]

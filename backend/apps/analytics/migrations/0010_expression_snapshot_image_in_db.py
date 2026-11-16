import os

from django.conf import settings
from django.db import migrations, models


def files_to_rows(apps, schema_editor):
    """Copy each photo file into its row. A row whose file is gone has no photo left, so it is dropped."""
    ExpressionSnapshot = apps.get_model('analytics', 'ExpressionSnapshot')
    for snap in ExpressionSnapshot.objects.all().iterator():
        try:
            with open(os.path.join(settings.MEDIA_ROOT, snap.image_path), 'rb') as fh:
                snap.image = fh.read()
        except OSError:
            snap.delete()
            continue
        snap.save(update_fields=['image'])


class Migration(migrations.Migration):
    """Expression photos move from files under MEDIA_ROOT into the database (0011 removes the files)."""

    dependencies = [
        ('analytics', '0009_participant_stats'),
    ]

    operations = [
        migrations.RenameField(model_name='expressionsnapshot', old_name='image', new_name='image_path'),
        migrations.AddField(
            model_name='expressionsnapshot',
            name='image',
            field=models.BinaryField(default=b''),
            preserve_default=False,
        ),
        migrations.RunPython(files_to_rows, migrations.RunPython.noop),
    ]

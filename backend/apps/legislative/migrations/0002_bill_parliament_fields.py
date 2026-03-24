"""
Add sponsor and parliament_url to the Bill model.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("legislative", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="bill",
            name="sponsor",
            field=models.CharField(
                max_length=255,
                blank=True,
                default="",
                help_text="MP, Senator, or Government who introduced the bill.",
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="bill",
            name="parliament_url",
            field=models.URLField(
                blank=True,
                default="",
                help_text="Direct link to the bill on parliament.go.ke.",
            ),
            preserve_default=False,
        ),
    ]

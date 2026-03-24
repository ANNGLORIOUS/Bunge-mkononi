"""
Increase bill URL field lengths for Parliament links.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("legislative", "0002_bill_parliament_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="bill",
            name="full_text_url",
            field=models.URLField(blank=True, max_length=2048),
        ),
        migrations.AlterField(
            model_name="bill",
            name="parliament_url",
            field=models.URLField(blank=True, default="", help_text="Direct link to the bill on parliament.go.ke.", max_length=2048),
        ),
    ]

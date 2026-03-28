from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("legislative", "0008_bill_ai_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="bill",
            name="document_source_fingerprint",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
    ]

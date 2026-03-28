from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("legislative", "0007_alter_outboundmessage_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="bill",
            name="ai_error",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="bill",
            name="ai_key_points",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="bill",
            name="ai_processed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="bill",
            name="ai_source_hash",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddField(
            model_name="bill",
            name="ai_summary",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="bill",
            name="ai_timeline",
            field=models.JSONField(blank=True, default=list),
        ),
    ]

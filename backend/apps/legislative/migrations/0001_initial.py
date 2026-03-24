from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Bill",
            fields=[
                ("id", models.CharField(max_length=64, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=255)),
                ("summary", models.TextField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("First Reading", "First Reading"),
                            ("Committee", "Committee"),
                            ("Second Reading", "Second Reading"),
                            ("Third Reading", "Third Reading"),
                            ("Presidential Assent", "Presidential Assent"),
                        ],
                        default="First Reading",
                        max_length=32,
                    ),
                ),
                (
                    "category",
                    models.CharField(
                        choices=[
                            ("Finance", "Finance"),
                            ("Health", "Health"),
                            ("Education", "Education"),
                            ("Justice", "Justice"),
                            ("Environment", "Environment"),
                        ],
                        max_length=32,
                    ),
                ),
                ("date_introduced", models.DateField()),
                ("is_hot", models.BooleanField(default=False)),
                ("full_text_url", models.URLField(blank=True)),
                ("key_points", models.JSONField(blank=True, default=list)),
                ("timeline", models.JSONField(blank=True, default=list)),
                ("subscriber_count", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "ordering": ["-is_hot", "-date_introduced", "title"],
            },
        ),
        migrations.CreateModel(
            name="Representative",
            fields=[
                ("id", models.CharField(max_length=64, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=255)),
                (
                    "role",
                    models.CharField(
                        choices=[("MP", "MP"), ("MCA", "MCA"), ("Senator", "Senator")],
                        max_length=16,
                    ),
                ),
                ("constituency", models.CharField(max_length=255)),
                ("county", models.CharField(max_length=255)),
                ("party", models.CharField(max_length=255)),
                ("image_url", models.URLField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="Petition",
            fields=[
                ("id", models.CharField(max_length=64, primary_key=True, serialize=False)),
                (
                    "bill",
                    models.OneToOneField(on_delete=models.CASCADE, related_name="petition", to="legislative.bill"),
                ),
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField()),
                ("signature_count", models.PositiveIntegerField(default=0)),
                ("goal", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["-signature_count", "title"],
            },
        ),
        migrations.CreateModel(
            name="CountyStat",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("county", models.CharField(max_length=255)),
                ("engagement_count", models.PositiveIntegerField(default=0)),
                (
                    "sentiment",
                    models.CharField(
                        choices=[("Support", "Support"), ("Oppose", "Oppose"), ("Mixed", "Mixed")],
                        max_length=16,
                    ),
                ),
                (
                    "bill",
                    models.ForeignKey(blank=True, null=True, on_delete=models.CASCADE, related_name="county_stats", to="legislative.bill"),
                ),
            ],
            options={
                "ordering": ["-engagement_count", "county"],
                "constraints": [
                    models.UniqueConstraint(fields=("bill", "county"), name="unique_county_stat_per_bill"),
                ],
            },
        ),
        migrations.CreateModel(
            name="PollResponse",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("phone_number", models.CharField(blank=True, max_length=32)),
                (
                    "choice",
                    models.CharField(
                        choices=[("support", "Support"), ("oppose", "Oppose"), ("need_more_info", "Need more info")],
                        max_length=24,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "bill",
                    models.ForeignKey(on_delete=models.CASCADE, related_name="poll_responses", to="legislative.bill"),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="Subscription",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("phone_number", models.CharField(max_length=32)),
                (
                    "channel",
                    models.CharField(
                        choices=[("sms", "SMS"), ("ussd", "USSD")],
                        default="sms",
                        max_length=16,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "bill",
                    models.ForeignKey(blank=True, null=True, on_delete=models.CASCADE, related_name="subscriptions", to="legislative.bill"),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="SystemLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "event_type",
                    models.CharField(
                        choices=[
                            ("status_change", "Status change"),
                            ("sms_broadcast", "SMS broadcast"),
                            ("ussd_hit", "USSD hit"),
                            ("subscription", "Subscription"),
                            ("vote", "Vote"),
                            ("system", "System"),
                        ],
                        default="system",
                        max_length=32,
                    ),
                ),
                ("message", models.TextField()),
                ("metadata", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="RepresentativeVote",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "vote",
                    models.CharField(choices=[("Yes", "Yes"), ("No", "No"), ("Abstain", "Abstain")], max_length=16),
                ),
                ("voted_at", models.DateTimeField(auto_now_add=True)),
                (
                    "bill",
                    models.ForeignKey(on_delete=models.CASCADE, related_name="representative_votes", to="legislative.bill"),
                ),
                (
                    "representative",
                    models.ForeignKey(on_delete=models.CASCADE, related_name="votes", to="legislative.representative"),
                ),
            ],
            options={
                "ordering": ["-voted_at"],
                "constraints": [
                    models.UniqueConstraint(fields=("representative", "bill"), name="unique_vote_per_representative_bill"),
                ],
            },
        ),
    ]

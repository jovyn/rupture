from django.http import Http404, JsonResponse
from django.views.generic import View
from django.views.decorators.csrf import csrf_exempt
from breach.strategy import Strategy
from breach.models import Target, Victim, Round
from django.core import serializers
from .forms import TargetForm, VictimForm, AttackForm
import json
from django.utils import timezone
import time


def get_work(request, victim_id=0):
    assert(victim_id)

    try:
        victim = Victim.objects.get(pk=victim_id)
    except:
        raise Http404('Victim not found')

    strategy = Strategy(victim)
    new_work = strategy.get_work()

    return JsonResponse(new_work)


@csrf_exempt
def work_completed(request, victim_id=0):
    assert(victim_id)

    realtime_parameters = json.loads(request.body.decode('utf-8'))
    assert('success' in realtime_parameters)

    success = realtime_parameters['success']

    try:
        victim = Victim.objects.get(pk=victim_id)
    except:
        raise Http404('Victim not found')

    strategy = Strategy(victim)
    victory = strategy.work_completed(success)

    return JsonResponse({
        'victory': victory
    })


class TargetView(View):

    def post(self, request):
        form = TargetForm(json.loads(request.body.decode('utf-8')))
        if form.is_valid():
            target = form.save()
            return JsonResponse({
               'target_name': target.name
            })

    def get(self, request):
        return JsonResponse({
            'targets': list(Target.objects.all().values())
        })


class VictimListView(View):

    def post(self, request):
        input_data = json.loads(request.body.decode('utf-8'))
        form = VictimForm(input_data)
        if form.is_valid():
            victim = Victim.objects.create(
                sourceip=input_data['sourceip'],
            )
            return JsonResponse({
                'victim_id': victim.id
            })

    def get(self, request):
        victims = Victim.objects.all()
        ret_victims = []
        for i, victim in enumerate(victims):
            if victim.state == 'discovered':
                if victim.running_time < 900:
                    ret_victims.append({'victim_id': victim.id, 'state': victim.state, 'sourceip': victim.sourceip})
            else:
                ret_victims.append({'victim_id': victim.id, 'state': victim.state, 'target_name': victim.target.name,
                                    'percentage': victim.percentage, 'start_time': time.mktime(victim.attacked_at.timetuple()),
                                    'sourceip': victim.sourceip})

        return JsonResponse({
            'victims': ret_victims,
        })


class AttackView(View):
    def post(self, request):
        input_data = json.loads(request.body.decode('utf-8'))
        if 'id' in input_data:
            form = AttackForm(input_data)
            if form.is_valid():
                target = Target.objects.get(name=input_data['target'])
                victim_id = input_data['id']
                victim = Victim.objects.get(pk=victim_id)
                victim.state = 'running'
                victim.attacked_at = timezone.now()
                victim.target = target
                victim.recordscardinality = target.recordscardinality
                victim.save()
        else:
            form = VictimForm(input_data)
            if form.is_valid():
                target = Target.objects.get(name=input_data['target'])
                victim = Victim.objects.create(
                    sourceip=input_data['sourceip'],
                    target=target,
                    recordscardinality=target.recordscardinality,
                    state='running',
                    attacked_at=timezone.now()
                )

        victim.attack

        return JsonResponse({
            'victim_id': victim.id
        })


class VictimDetailView(View):
    def get(self, request, victim_id):
        # get victim with the given ID
        victim = Victim.objects.get(pk=victim_id)

        rounds = Round.objects.filter(victim__id=victim_id)
        attack_details_list = []
        for round_details in rounds:
            attack_details_list.extend(round_details.fetch_per_batch_info())

        try:
            known_secret = rounds.order_by('-id').reverse()[0].knownsecret
        except:
            known_secret = victim.target.prefix

        return JsonResponse({
            'id': victim.id,
            'victim_ip': victim.sourceip,
            'state': victim.state,
            'known_secret': known_secret,
            'target_name': victim.target.name,
            'attack_details': attack_details_list,
            'percentage': victim.percentage
        })
>>>>>>> cef3a62... Add /victim/<victim_id> GET endpoint
